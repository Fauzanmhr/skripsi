// Controller untuk halaman dan API terkait ulasan Google Maps
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

// Menyimpan file yang diunggah sementara dalam memori
const uploadedFiles = new Map();

// Fungsi untuk membuat file Excel dari data ulasan
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

// Fungsi untuk membuat URL halaman dengan query string
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

// Render halaman utama ulasan dengan filter dan pagination
export async function renderReviewsPage(req, res) {
  try {
    // Mendapatkan parameter pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Mendapatkan parameter filter 
    const sentimentFilter = req.query.sentiment || "";
    const startDateFilter = req.query.startDate || "";
    const endDateFilter = req.query.endDate || "";

    // Mendapatkan semua jenis sentimen untuk filter dropdown
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

    // Membangun kondisi WHERE untuk query
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

    // Menghitung total ulasan yang sesuai filter
    const totalCount = await Review.count({ where });

    // Mengambil data ulasan sesuai filter, limit dan offset
    const reviews = await Review.findAll({
      where,
      order: [["time_published", "DESC"]],
      limit,
      offset,
    });

    // Menghitung total halaman untuk pagination
    const totalPages = Math.ceil(totalCount / limit);

    // Mendapatkan nilai sentimen untuk dropdown filter
    const availableSentiments = sentiments.map((item) => item.sentiment);

    // Mendapatkan status scraping terakhir
    const latestScrapeStatus = await ScrapeStatus.findOne({
      order: [["id", "DESC"]],
    });

    // Mendapatkan URL Google Maps yang dikonfigurasi
    const googleMapsUrl = await getGoogleMapsSetting();

    // Ekstrak nama tempat dari URL Google Maps
    const placeName = extractPlaceName(googleMapsUrl);

    // Render halaman ulasan dengan semua data yang dibutuhkan
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
    // Handling error jika terjadi masalah
    console.error("Reviews page rendering error:", error);
    res.status(500).render("error/error", {
      message: "Gagal memuat ulasan",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
}

// Handler untuk memulai proses crawling ulasan dari Google Maps
export async function handleCrawlRequest(req, res) {
  let scrapeRecord = null;
  const startTime = new Date();

  try {
    // Cek apakah ada scrape yang sedang berjalan untuk mencegah duplikasi
    const runningScrape = await ScrapeStatus.findOne({
      where: { status: "running" },
    });
    if (runningScrape) {
      return res.status(409).json({
        success: false,
        message: `Scrape tidak dapat dimulai: Scrape lain (${runningScrape.type}) sedang berjalan.`,
      });
    }

    // Hapus catatan scrape manual sebelumnya
    await ScrapeStatus.destroy({ where: { type: "manual" } });
    console.log("Cleaned up previous 'manual' scrape logs.");

    // Buat catatan baru untuk proses scrape yang akan berjalan
    scrapeRecord = await ScrapeStatus.create({
      type: "manual",
      status: "running",
      startTime: startTime,
    });

    // Ambil URL Google Maps dan mulai proses crawling
    const googleMapsURL = process.env.GOOGLE_MAPS_URL;
    const result = await crawlAndSaveReviews(googleMapsURL);
    const endTime = new Date();
    const message = `Crawling selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;

    // Update status scrape menjadi completed
    await scrapeRecord.update({
      status: "completed",
      endTime: endTime,
      message: message,
    });

    // Kirim response sukses
    res.json({
      success: true,
      message: "Scrape process initiated successfully.",
      scrapeRecord: scrapeRecord.toJSON(),
    });
  } catch (error) {
    // Handling error saat proses crawling
    const endTime = new Date();
    const errorMessage = `Gagal melakukan crawling ulasan: ${error.message}`;
    console.error("Crawling error:", error);
    let finalStatus = null;

    // Coba update status scrape record jika sudah dibuat
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
      // Buat record status failed jika record belum dibuat
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

    // Kirim response error
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

// Ekspor data ulasan ke file Excel berdasarkan filter
export async function exportReviewsToExcel(req, res) {
  try {
    // Ambil parameter filter dari query
    const { sentiment, startDate, endDate } = req.query;

    // Bangun kondisi WHERE untuk query
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

    // Ambil semua data ulasan sesuai filter
    const reviews = await Review.findAll({
      where,
      order: [["time_published", "DESC"]],
    });

    // Generate file Excel dari data ulasan
    const workbook = await generateReviewsExcel(reviews);

    // Set header untuk download file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=ulasan_export.xlsx",
    );

    // Tulis workbook ke response stream
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    // Handling error eksport
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

// Mendapatkan status pengaturan scrape otomatis
export async function getAutoScrapeSettings(req, res) {
  try {
    // Ambil pengaturan scrape otomatis
    const settings = getSettings();

    // Ambil data scrape otomatis terakhir
    const lastAutoScrape = await ScrapeStatus.findOne({
      where: {
        type: "auto",
        status: {
          [Op.in]: ["completed", "failed"],
        },
      },
      order: [["id", "DESC"]],
    });

    // Kirim response dengan data pengaturan
    res.json({
      enabled: settings.enabled,
      nextScrape: settings.nextScrape,
      lastAutoScrape: lastAutoScrape ? lastAutoScrape.toJSON() : null,
    });
  } catch (error) {
    // Handling error
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

// Update status aktif/nonaktif scrape otomatis
export async function updateAutoScrapeSettings(req, res) {
  try {
    // Ambil parameter enabled dari request body
    const { enabled } = req.body;

    // Validasi tipe data parameter
    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Status aktif harus berupa boolean",
      });
    }

    // Simpan pengaturan baru
    const updatedSettings = await saveSettings({ enabled });

    // Kirim response sukses
    res.json({
      success: true,
      message: `Scrape otomatis ${enabled ? "diaktifkan" : "dinonaktifkan"}`,
      settings: updatedSettings,
    });
  } catch (error) {
    // Handling error
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

// Mendapatkan status scrape terakhir
export async function getLatestScrapeStatus(req, res) {
  try {
    // Ambil status scrape paling baru
    const latestStatus = await ScrapeStatus.findOne({
      order: [["id", "DESC"]],
    });
    res.json(latestStatus ? latestStatus.toJSON() : null);
  } catch (error) {
    // Handling error
    console.error("Error fetching latest scrape status:", error);
    res.status(500).json({ message: "Failed to fetch status" });
  }
}

// Update URL Google Maps dan hapus data jika URL berubah
export async function handleUpdateGoogleMapsUrl(req, res) {
  // Mulai transaksi database untuk memastikan atomicity
  const transaction = await sequelize.transaction();

  try {
    // Ambil URL baru dari request body
    const { google_maps_url } = req.body;

    // Validasi URL Google Maps
    if (!google_maps_url || !google_maps_url.includes("google.com/maps")) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid Google Maps URL. Please provide a valid Google Maps URL.",
      });
    }

    // Cek apakah URL berubah
    const currentUrl = await getGoogleMapsSetting();
    const isUrlChanging = currentUrl && currentUrl !== google_maps_url;

    // Jika URL berubah, hapus semua ulasan dan status scrape
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

    // Update URL Google Maps
    await updateGoogleMapsSetting(google_maps_url);

    // Commit transaksi
    await transaction.commit();

    // Kirim response sukses
    res.json({
      success: true,
      message: isUrlChanging
        ? "Google Maps URL updated successfully. All existing reviews have been deleted."
        : "Google Maps URL updated successfully.",
      url: google_maps_url,
      dataDeleted: isUrlChanging,
    });
  } catch (error) {
    // Rollback transaksi jika terjadi error
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

// Handler untuk upload file (CSV/XLSX) untuk dianalisis sentimen
export async function handleFileUpload(req, res) {
  try {
    // Validasi file yang diupload
    if (!req.file) {
      return res.status(400).json({ error: "Tidak ada file yang diunggah" });
    }

    // Ambil data dan tipe file
    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let rows = [];

    // Parse file berdasarkan tipe (CSV atau Excel)
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

    // Validasi data dalam file
    if (rows.length === 0) {
      return res
        .status(400)
        .json({ error: "Tidak ada data ditemukan dalam file" });
    }

    // Dapatkan nama kolom dari baris pertama
    const columns = Object.keys(rows[0]);

    // Buat ID unik untuk file
    const fileId = Date.now().toString();

    // Simpan data file dalam memori
    uploadedFiles.set(fileId, {
      rows,
      originalFilename: req.file.originalname,
      timestamp: Date.now(),
    });

    // Kirim response sukses dengan preview data
    res.json({
      success: true,
      columns,
      preview: rows,
      totalRows: rows.length,
      fileId: fileId,
      originalFilename: req.file.originalname,
    });
  } catch (error) {
    // Handling error
    console.error("Kesalahan unggah file:", error);
    res.status(500).json({
      error: "Gagal memproses file",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
}

// Proses analisis sentimen dari file yang diupload
export async function processFileAnalysis(req, res) {
  try {
    // Ambil ID file dan nama kolom dari request body
    const { fileId, column } = req.body;

    // Validasi parameter yang diperlukan
    if (!column || !fileId) {
      return res
        .status(400)
        .json({ error: "Parameter yang diperlukan tidak ada" });
    }

    // Dapatkan data file dari memori
    const fileData = uploadedFiles.get(fileId);
    if (!fileData) {
      return res.status(404).json({
        error: "File tidak ditemukan atau kedaluwarsa. Silakan unggah lagi.",
      });
    }

    // Ekstrak data file dan proses untuk analisis sentimen
    const { rows, originalFilename } = fileData;
    const processedRows = await processFileContent(rows, column);

    // Generate file output sesuai format asli (CSV atau Excel)
    let outputFile;
    if (originalFilename.endsWith(".csv")) {
      outputFile = await generateCSV(processedRows);
    } else {
      outputFile = await generateExcel(processedRows);
    }

    // Hapus file dari memori
    uploadedFiles.delete(fileId);

    // Kirim response sukses dengan file hasil analisis
    res.json({
      success: true,
      filename: `teranalisis_${originalFilename}`,
      file: outputFile.toString("base64"),
      total: processedRows.length,
    });
  } catch (error) {
    // Handling error
    console.error("Kesalahan analisis:", error);
    res.status(500).json({
      error: "Gagal menganalisis file",
      details: process.env.NODE_ENV === "development" ? error.message : null,
    });
  }
}
