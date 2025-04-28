import Review from "../models/review.js";
import {
  crawlAndSaveReviews,
  getGoogleMapsSetting,
  updateGoogleMapsSetting,
  extractPlaceName,
} from "../services/googleMapsService.js";
import { Op } from "sequelize";
import { getSettings, saveSettings } from "../services/autoScrapeService.js";
import ScrapeStatus from "../models/scrapeStatus.js";
import { sequelize } from "../config/database.js";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import {
  parseCSV,
  parseExcel,
  generateCSV,
  generateExcel,
  processFileContent,
} from "../services/analyzeService.js";

const uploadedFiles = new Map();

async function generateReviewsExcel(reviews) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ulasan");

  worksheet.columns = [
    { header: "Tanggal", key: "date", width: 15 },
    { header: "Ulasan", key: "review", width: 50 },
    { header: "Sentimen", key: "sentiment", width: 15 },
  ];

  reviews.forEach((review) => {
    worksheet.addRow({
      date: format(new Date(review.time_published), "yyyy-MM-dd"),
      review: review.review,
      sentiment: review.sentiment || "Sedang Diproses",
    });
  });

  worksheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
  });

  return workbook;
}

function getPageUrl(req, page) {
  const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}`;
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(req.query)) {
    if (key !== "page") {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set("page", page);

  return url.search;
}

export async function renderReviewsPage(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const sentimentFilter = req.query.sentiment || "";
    const startDateFilter = req.query.startDate || "";
    const endDateFilter = req.query.endDate || "";

    const sentiments = await Review.findAll({
      attributes: ["sentiment"],
      where: {
        sentiment: {
          [Op.not]: null,
        },
      },
      group: ["sentiment"],
      order: [["sentiment", "ASC"]],
    });

    const where = {};

    if (sentimentFilter === "pending") {
      where.sentiment = null;
    } else if (sentimentFilter) {
      where.sentiment = sentimentFilter;
    }

    if (startDateFilter || endDateFilter) {
      where.time_published = {};

      if (startDateFilter) {
        const startDate = new Date(startDateFilter);
        startDate.setHours(0, 0, 0, 0);
        where.time_published[Op.gte] = startDate;
      }

      if (endDateFilter) {
        const endDate = new Date(endDateFilter);
        endDate.setHours(23, 59, 59, 999);
        where.time_published[Op.lte] = endDate;
      }
    }

    const totalCount = await Review.count({ where });

    const reviews = await Review.findAll({
      where,
      order: [["time_published", "DESC"]],
      limit,
      offset,
    });

    const totalPages = Math.ceil(totalCount / limit);

    const availableSentiments = sentiments.map((item) => item.sentiment);

    const latestScrapeStatus = await ScrapeStatus.findOne({
      order: [["id", "DESC"]],
    });

    const googleMapsUrl = await getGoogleMapsSetting();

    const placeName = extractPlaceName(googleMapsUrl);

    res.render("reviews", {
      title: "Data Ulasan",
      reviews,
      pagination: {
        page,
        limit,
        totalPages,
        totalCount,
      },
      filters: {
        sentiment: sentimentFilter,
        startDate: startDateFilter,
        endDate: endDateFilter,
      },
      filterOptions: {
        sentiments: availableSentiments,
      },
      page: "reviews",
      getPageUrl: (page) => getPageUrl(req, page),
      latestScrapeStatus: latestScrapeStatus
        ? latestScrapeStatus.toJSON()
        : null,
      googleMapsUrl: googleMapsUrl,
      placeName: placeName,
    });
  } catch (error) {
    console.error("Reviews page rendering error:", error);
    res.status(500).render("error/error", {
      message: "Gagal memuat ulasan",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
}

export async function handleCrawlRequest(req, res) {
  let scrapeRecord = null;
  const startTime = new Date();

  try {
    const runningScrape = await ScrapeStatus.findOne({
      where: { status: "running" },
    });
    if (runningScrape) {
      return res.status(409).json({
        success: false,
        message: `Scrape tidak dapat dimulai: Scrape lain (${runningScrape.type}) sedang berjalan.`,
      });
    }

    await ScrapeStatus.destroy({ where: { type: "manual" } });
    console.log("Cleaned up previous 'manual' scrape logs.");

    scrapeRecord = await ScrapeStatus.create({
      type: "manual",
      status: "running",
      startTime: startTime,
    });

    const googleMapsURL = process.env.GOOGLE_MAPS_URL;
    const result = await crawlAndSaveReviews(googleMapsURL);
    const endTime = new Date();
    const message = `Crawling selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;

    await scrapeRecord.update({
      status: "completed",
      endTime: endTime,
      message: message,
    });

    res.json({
      success: true,
      message: "Scrape process initiated successfully.",
      scrapeRecord: scrapeRecord.toJSON(),
    });
  } catch (error) {
    const endTime = new Date();
    const errorMessage = `Gagal melakukan crawling ulasan: ${error.message}`;
    console.error("Crawling error:", error);
    let finalStatus = null;

    if (scrapeRecord) {
      try {
        await scrapeRecord.update({
          status: "failed",
          endTime: endTime,
          message: errorMessage,
        });
        finalStatus = scrapeRecord.toJSON();
      } catch (updateError) {
        console.error("Failed to update scrape status to failed:", updateError);
        finalStatus = {
          type: "manual",
          status: "failed",
          startTime: scrapeRecord.startTime,
          endTime: endTime,
          message: errorMessage + " (DB update failed)",
        };
      }
    } else {
      try {
        const failedRecord = await ScrapeStatus.create({
          type: "manual",
          status: "failed",
          startTime: startTime,
          endTime: endTime,
          message: `Failed to even start scrape process: ${error.message}`,
        });
        finalStatus = failedRecord.toJSON();
      } catch (createError) {
        console.error(
          "Failed to create 'failed' scrape status record:",
          createError,
        );
        finalStatus = {
          type: "manual",
          status: "failed",
          startTime: startTime,
          endTime: endTime,
          message: errorMessage + " (DB creation failed)",
        };
      }
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal Server Error",
      scrapeRecord: finalStatus,
    });
  }
}

export async function exportReviewsToExcel(req, res) {
  try {
    const { sentiment, startDate, endDate } = req.query;

    const where = {};

    if (sentiment === "pending") {
      where.sentiment = null;
    } else if (sentiment) {
      where.sentiment = sentiment;
    }

    if (startDate || endDate) {
      where.time_published = {};
      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(0, 0, 0, 0);
        where.time_published[Op.gte] = startDateTime;
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        where.time_published[Op.lte] = endDateTime;
      }
    }

    const reviews = await Review.findAll({
      where,
      order: [["time_published", "DESC"]],
    });

    const workbook = await generateReviewsExcel(reviews);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ulasan_export.xlsx",
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengekspor ulasan",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal Server Error",
    });
  }
}

export async function getAutoScrapeSettings(req, res) {
  try {
    const settings = getSettings();

    const lastAutoScrape = await ScrapeStatus.findOne({
      where: {
        type: "auto",
        status: {
          [Op.in]: ["completed", "failed"],
        },
      },
      order: [["id", "DESC"]],
    });

    res.json({
      enabled: settings.enabled,
      nextScrape: settings.nextScrape,
      lastAutoScrape: lastAutoScrape ? lastAutoScrape.toJSON() : null,
    });
  } catch (error) {
    console.error("Error getting auto scrape settings:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mendapatkan pengaturan scrape otomatis",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal Server Error",
    });
  }
}

export async function updateAutoScrapeSettings(req, res) {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Status aktif harus berupa boolean",
      });
    }

    const updatedSettings = await saveSettings({ enabled });

    res.json({
      success: true,
      message: `Scrape otomatis ${enabled ? "diaktifkan" : "dinonaktifkan"}`,
      settings: updatedSettings,
    });
  } catch (error) {
    console.error("Error updating auto scrape settings:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui pengaturan scrape otomatis",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal Server Error",
    });
  }
}

export async function getLatestScrapeStatus(req, res) {
  try {
    const latestStatus = await ScrapeStatus.findOne({
      order: [["id", "DESC"]],
    });
    res.json(latestStatus ? latestStatus.toJSON() : null);
  } catch (error) {
    console.error("Error fetching latest scrape status:", error);
    res.status(500).json({ message: "Failed to fetch status" });
  }
}

export async function handleUpdateGoogleMapsUrl(req, res) {
  const transaction = await sequelize.transaction();

  try {
    const { google_maps_url } = req.body;

    if (!google_maps_url || !google_maps_url.includes("google.com/maps")) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid Google Maps URL. Please provide a valid Google Maps URL.",
      });
    }

    const currentUrl = await getGoogleMapsSetting();
    const isUrlChanging = currentUrl && currentUrl !== google_maps_url;

    if (isUrlChanging) {
      await Review.destroy({
        where: {},
        truncate: true,
        cascade: true,
        transaction,
      });

      await ScrapeStatus.destroy({
        where: {},
        truncate: true,
        cascade: true,
        transaction,
      });

      console.log(
        "All reviews and scrape statuses deleted due to Google Maps URL change",
      );
    }

    await updateGoogleMapsSetting(google_maps_url);

    await transaction.commit();

    res.json({
      success: true,
      message: isUrlChanging
        ? "Google Maps URL updated successfully. All existing reviews have been deleted."
        : "Google Maps URL updated successfully.",
      url: google_maps_url,
      dataDeleted: isUrlChanging,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating Google Maps URL:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update Google Maps URL",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal Server Error",
    });
  }
}

export async function handleFileUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let rows = [];

    if (fileType === "text/csv" || req.file.originalname.endsWith(".csv")) {
      rows = await parseCSV(fileBuffer);
    } else if (
      fileType.includes("spreadsheet") ||
      req.file.originalname.endsWith(".xlsx")
    ) {
      rows = await parseExcel(fileBuffer);
    } else {
      return res.status(400).json({ error: "Jenis file tidak didukung" });
    }

    if (rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Tidak ada data ditemukan dalam file" });
    }

    const columns = Object.keys(rows[0]);

    const fileId = Date.now().toString();

    uploadedFiles.set(fileId, {
      rows,
      originalFilename: req.file.originalname,
      timestamp: Date.now(),
    });

    res.json({
      success: true,
      columns,
      preview: rows,
      totalRows: rows.length,
      fileId: fileId,
      originalFilename: req.file.originalname,
    });
  } catch (error) {
    console.error("Kesalahan unggah file:", error);
    res.status(500).json({
      error: "Gagal memproses file",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
}

export async function processFileAnalysis(req, res) {
  try {
    const { fileId, column } = req.body;

    if (!column || !fileId) {
      return res
        .status(400)
        .json({ error: "Parameter yang diperlukan tidak ada" });
    }

    const fileData = uploadedFiles.get(fileId);
    if (!fileData) {
      return res
        .status(404)
        .json({
          error: "File tidak ditemukan atau kedaluwarsa. Silakan unggah lagi.",
        });
    }

    const { rows, originalFilename } = fileData;
    const processedRows = await processFileContent(rows, column);

    let outputFile;
    if (originalFilename.endsWith(".csv")) {
      outputFile = await generateCSV(processedRows);
    } else {
      outputFile = await generateExcel(processedRows);
    }

    uploadedFiles.delete(fileId);

    res.json({
      success: true,
      filename: `teranalisis_${originalFilename}`,
      file: outputFile.toString("base64"),
      total: processedRows.length,
    });
  } catch (error) {
    console.error("Kesalahan analisis:", error);
    res.status(500).json({
      error: "Gagal menganalisis file",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
}
