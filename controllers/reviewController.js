import Review from '../models/review.js';
import { crawlAndSaveReviews, getGoogleMapsUrl, updateGoogleMapsUrl } from '../services/googleMapsService.js';
import { Op } from 'sequelize';
import { generateReviewsExcel } from '../services/exportService.js';
import { getSettings, saveSettings } from '../services/autoScrapeService.js';
import ScrapeStatus from '../models/scrapeStatus.js';
import { sequelize } from '../config/database.js';

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

    // Get current running manual scrape status (for button state only)
    const runningManualScrape = await ScrapeStatus.findOne({
        where: { type: 'manual', status: 'running' },
        order: [['startTime', 'DESC']]
    });

    // Get the single latest scrape status entry (any type, any status) by ID
    const latestScrapeStatus = await ScrapeStatus.findOne({
        order: [['id', 'DESC']]
    });

    // Get Google Maps URL for settings modal
    const googleMapsUrl = await getGoogleMapsUrl(); // Function now comes from googleMapsService

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
      manualScrapeStatus: runningManualScrape ? runningManualScrape.toJSON() : { status: 'idle' },
      latestScrapeStatus: latestScrapeStatus ? latestScrapeStatus.toJSON() : null,
      googleMapsUrl: googleMapsUrl // Add Google Maps URL
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
    const currentUrl = await getGoogleMapsUrl(); // Function now comes from googleMapsService
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
    await updateGoogleMapsUrl(google_maps_url); // Function now comes from googleMapsService
    
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