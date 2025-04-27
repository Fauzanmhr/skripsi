import Review from '../models/review.js';
import { crawlAndSaveReviews, getGoogleMapsSetting, updateGoogleMapsSetting, extractPlaceName } from '../services/googleMapsService.js';
import { Op } from 'sequelize';
import { getSettings, saveSettings } from '../services/autoScrapeService.js';
import ScrapeStatus from '../models/scrapeStatus.js';
import { sequelize } from '../config/database.js';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import {
  parseCSV,
  parseExcel,
  generateCSV,
  generateExcel,
  processFileContent
} from '../services/analyzeService.js';

// In-memory storage for uploaded files
const uploadedFiles = new Map();

// Helper function to generate Excel workbook
async function generateReviewsExcel(reviews) {
  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Ulasan');
  
  // Define columns
  worksheet.columns = [
    { header: 'Tanggal', key: 'date', width: 15 },
    { header: 'Ulasan', key: 'review', width: 50 },
    { header: 'Sentimen', key: 'sentiment', width: 15 }
  ];
  
  // Add rows
  reviews.forEach(review => {
    worksheet.addRow({
      date: format(new Date(review.time_published), 'yyyy-MM-dd'),
      review: review.review,
      sentiment: review.sentiment || 'Sedang Diproses'
    });
  });
  
  // Style header row
  worksheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };
  });
  
  return workbook;
}

// Helper function to generate pagination url
function getPageUrl(req, page) {
  const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`;
  const url = new URL(baseUrl);
  
  // Add all existing query params
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'page') {
      url.searchParams.set(key, value);
    }
  }
  
  // Set the requested page
  url.searchParams.set('page', page);
  
  return url.search;
}

// Controller to render the reviews page
export async function renderReviewsPage(req, res) {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Extract filter parameters
    const sentimentFilter = req.query.sentiment || '';
    const startDateFilter = req.query.startDate || '';
    const endDateFilter = req.query.endDate || '';
    
    // Get all available sentiments from the database
    const sentiments = await Review.findAll({
      attributes: ['sentiment'],
      where: {
        sentiment: {
          [Op.not]: null
        }
      },
      group: ['sentiment'],
      order: [['sentiment', 'ASC']]
    });
    
    // query conditions based on filters
    const where = {};
    
    if (sentimentFilter === 'pending') {
      where.sentiment = null;
    } else if (sentimentFilter) {
      where.sentiment = sentimentFilter;
    }
    
    // Add date range filter if provided
    if (startDateFilter || endDateFilter) {
      where.time_published = {};
      
      if (startDateFilter) {
        // Set to beginning of the day
        const startDate = new Date(startDateFilter);
        startDate.setHours(0, 0, 0, 0);
        where.time_published[Op.gte] = startDate;
      }
      
      if (endDateFilter) {
        // Set to end of the day
        const endDate = new Date(endDateFilter);
        endDate.setHours(23, 59, 59, 999);
        where.time_published[Op.lte] = endDate;
      }
    }
    
    // Get total count for pagination with applied filters
    const totalCount = await Review.count({ where });
    
    // Get reviews with pagination and filters
    const reviews = await Review.findAll({
      where,
      order: [['time_published', 'DESC']],
      limit,
      offset
    });
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    
    // Create a list of distinct sentiments for the filter dropdowns
    const availableSentiments = sentiments.map(item => item.sentiment);

    // Get the single latest scrape status entry (any type, any status) by ID
    const latestScrapeStatus = await ScrapeStatus.findOne({
        order: [['id', 'DESC']]
    });

    // Get Google Maps URL for settings modal
    const googleMapsUrl = await getGoogleMapsSetting(); // Renamed function call
    
    // Extract place name from the URL
    const placeName = extractPlaceName(googleMapsUrl);

    // Render the reviews page
    res.render('reviews', {
      title: 'Data Ulasan',
      reviews,
      pagination: {
        page,
        limit,
        totalPages,
        totalCount
      },
      filters: {
        sentiment: sentimentFilter,
        startDate: startDateFilter,
        endDate: endDateFilter
      },
      filterOptions: {
        sentiments: availableSentiments
      },
      page: 'reviews',
      getPageUrl: (page) => getPageUrl(req, page),
      latestScrapeStatus: latestScrapeStatus ? latestScrapeStatus.toJSON() : null,
      googleMapsUrl: googleMapsUrl, // Keep variable name as it holds the URL string
      placeName: placeName // Add place name
    });
  } catch (error) {
    console.error('Reviews page rendering error:', error);
    res.status(500).render('error/error', { // Use error view
      message: 'Gagal memuat ulasan',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
}

// Controller to handle Google Maps crawling request
export async function handleCrawlRequest(req, res) {
  let scrapeRecord = null;
  const startTime = new Date();

  try {
    // Check if another scrape is already running
    const runningScrape = await ScrapeStatus.findOne({ where: { status: 'running' } });
    if (runningScrape) {
      return res.status(409).json({
        success: false,
        message: `Scrape tidak dapat dimulai: Scrape lain (${runningScrape.type}) sedang berjalan.`,
      });
    }

    // Clean up old 'manual' logs before starting
    await ScrapeStatus.destroy({ where: { type: 'manual' } });
    console.log("Cleaned up previous 'manual' scrape logs.");

    // Record start in ScrapeStatus
    scrapeRecord = await ScrapeStatus.create({
      type: 'manual',
      status: 'running',
      startTime: startTime
    });

    // Perform the crawl (this might take time)
    const googleMapsURL = process.env.GOOGLE_MAPS_URL;
    const result = await crawlAndSaveReviews(googleMapsURL);
    const endTime = new Date();
    const message = `Crawling selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;

    // Update ScrapeStatus to completed
    await scrapeRecord.update({
      status: 'completed',
      endTime: endTime,
      message: message
    });

    // Respond immediately - client will poll for status updates
    res.json({
      success: true,
      message: "Scrape process initiated successfully.",
      scrapeRecord: scrapeRecord.toJSON()
    });

  } catch (error) {
    const endTime = new Date();
    const errorMessage = `Gagal melakukan crawling ulasan: ${error.message}`;
    console.error('Crawling error:', error);
    let finalStatus = null;

    // Update ScrapeStatus to failed if scrapeRecord exists
    if (scrapeRecord) {
      try {
        await scrapeRecord.update({
          status: 'failed',
          endTime: endTime,
          message: errorMessage
        });
        finalStatus = scrapeRecord.toJSON();
      } catch (updateError) {
        console.error("Failed to update scrape status to failed:", updateError);
        finalStatus = { type: 'manual', status: 'failed', startTime: scrapeRecord.startTime, endTime: endTime, message: errorMessage + " (DB update failed)" };
      }
    } else {
       // If creation failed, create a failed record now or construct one
       try {
         const failedRecord = await ScrapeStatus.create({
            type: 'manual',
            status: 'failed',
            startTime: startTime,
            endTime: endTime,
            message: `Failed to even start scrape process: ${error.message}`
         });
         finalStatus = failedRecord.toJSON();
       } catch (createError) {
          console.error("Failed to create 'failed' scrape status record:", createError);
          finalStatus = { type: 'manual', status: 'failed', startTime: startTime, endTime: endTime, message: errorMessage + " (DB creation failed)" };
       }
    }

    // Respond with error - client will poll for status updates if needed
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error',
      scrapeRecord: finalStatus
    });
  }
}

// Controller to export reviews to Excel
export async function exportReviewsToExcel(req, res) {
  try {
    // Extract filter parameters from query
    const { sentiment, startDate, endDate } = req.query;
    
    // Build where clause
    const where = {};
    
    if (sentiment === 'pending') {
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
    
    // Get all reviews with applied filters
    const reviews = await Review.findAll({
      where,
      order: [['time_published', 'DESC']]
    });
    
    // Generate Excel workbook using the service
    const workbook = await generateReviewsExcel(reviews);
    
    // Set response headers for file download
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=ulasan_export.xlsx'
    );
    
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengekspor ulasan',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}

// Controller to get auto scrape settings
export async function getAutoScrapeSettings(req, res) {
  try {
    const settings = getSettings(); // Get current enabled status and next scheduled time

    // Find the latest completed or failed 'auto' scrape
    const lastAutoScrape = await ScrapeStatus.findOne({
      where: {
        type: 'auto',
        status: {
          [Op.in]: ['completed', 'failed']
        }
      },
      order: [['id', 'DESC']] // Get the most recent one by ID
    });

    // Return current settings and info about the last auto scrape
    res.json({
        enabled: settings.enabled,
        nextScrape: settings.nextScrape,
        lastAutoScrape: lastAutoScrape ? lastAutoScrape.toJSON() : null // Add last auto scrape info
    });
  } catch (error) {
    console.error('Error getting auto scrape settings:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mendapatkan pengaturan scrape otomatis',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}

// Controller to update auto scrape settings
export async function updateAutoScrapeSettings(req, res) {
  try {
    const { enabled } = req.body;
    
    // Validate input
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'Status aktif harus berupa boolean'
      });
    }
    
    // Update settings
    const updatedSettings = await saveSettings({ enabled });
    
    res.json({
      success: true,
      message: `Scrape otomatis ${enabled ? 'diaktifkan' : 'dinonaktifkan'}`,
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Error updating auto scrape settings:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal memperbarui pengaturan scrape otomatis',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}

// Controller for AJAX Status Polling
export async function getLatestScrapeStatus(req, res) {
  try {
    const latestStatus = await ScrapeStatus.findOne({
      order: [['id', 'DESC']] // Get the absolute latest record
    });
    res.json(latestStatus ? latestStatus.toJSON() : null);
  } catch (error) {
    console.error("Error fetching latest scrape status:", error);
    res.status(500).json({ message: "Failed to fetch status" });
  }
}

// Controller to update Google Maps URL
export async function handleUpdateGoogleMapsUrl(req, res) {
  const transaction = await sequelize.transaction();
  
  try {
    const { google_maps_url } = req.body;
    
    // Validate URL
    if (!google_maps_url || !google_maps_url.includes('google.com/maps')) {
      return res.status(400).json({
        success: false, 
        message: 'Invalid Google Maps URL. Please provide a valid Google Maps URL.'
      });
    }
    
    // Get current URL to check if it's changing
    const currentUrl = await getGoogleMapsSetting(); // Renamed function call
    const isUrlChanging = currentUrl && currentUrl !== google_maps_url;
    
    // If URL is changing, delete all existing reviews
    if (isUrlChanging) {
      // Delete all reviews
      await Review.destroy({ 
        where: {},
        truncate: true,
        cascade: true,
        transaction
      });
      
      // Delete all scrape statuses
      await ScrapeStatus.destroy({
        where: {},
        truncate: true,
        cascade: true,
        transaction
      });
      
      console.log('All reviews and scrape statuses deleted due to Google Maps URL change');
    }
    
    // Update setting
    await updateGoogleMapsSetting(google_maps_url); // Renamed function call
    
    await transaction.commit();
    
    res.json({
      success: true,
      message: isUrlChanging ? 
        'Google Maps URL updated successfully. All existing reviews have been deleted.' : 
        'Google Maps URL updated successfully.',
      url: google_maps_url,
      dataDeleted: isUrlChanging
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating Google Maps URL:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update Google Maps URL',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}

// Handle file upload and preview for analyzer
export async function handleFileUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Tidak ada file yang diunggah' });
    }

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let rows = [];

    if (fileType === 'text/csv' || req.file.originalname.endsWith('.csv')) {
      rows = await parseCSV(fileBuffer);
    } else if (fileType.includes('spreadsheet') || req.file.originalname.endsWith('.xlsx')) {
      rows = await parseExcel(fileBuffer);
    } else {
      return res.status(400).json({ error: 'Jenis file tidak didukung' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data ditemukan dalam file' });
    }

    const columns = Object.keys(rows[0]);
    
    // Generate a unique ID for the file
    const fileId = Date.now().toString();
    
    // Store the parsed data in memory
    uploadedFiles.set(fileId, {
      rows,
      originalFilename: req.file.originalname,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      columns,
      preview: rows,
      totalRows: rows.length,
      fileId: fileId,
      originalFilename: req.file.originalname
    });

  } catch (error) {
    console.error('Kesalahan unggah file:', error);
    res.status(500).json({ 
      error: 'Gagal memproses file',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}

// Process the file with selected column
export async function processFileAnalysis(req, res) {
  try {
    const { fileId, column } = req.body;

    if (!column || !fileId) {
      return res.status(400).json({ error: 'Parameter yang diperlukan tidak ada' });
    }
    
    // Get the stored file data using the file ID
    const fileData = uploadedFiles.get(fileId);
    if (!fileData) {
      return res.status(404).json({ error: 'File tidak ditemukan atau kedaluwarsa. Silakan unggah lagi.' }); 
    }
    
    const { rows, originalFilename } = fileData;
    const processedRows = await processFileContent(rows, column);

    // Generate the output file
    let outputFile;
    if (originalFilename.endsWith('.csv')) {
      outputFile = await generateCSV(processedRows);
    } else {
      outputFile = await generateExcel(processedRows);
    }

    // Clean up the stored file data after processing
    uploadedFiles.delete(fileId);

    res.json({
      success: true,
      filename: `teranalisis_${originalFilename}`,
      file: outputFile.toString('base64'),
      total: processedRows.length
    });

  } catch (error) {
    console.error('Kesalahan analisis:', error);
    res.status(500).json({ 
      error: 'Gagal menganalisis file',
      details: process.env.NODE_ENV === 'development' ? error.message : null
    });
  }
}