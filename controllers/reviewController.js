import Review from '../models/review.js';
import { crawlAndSaveReviews } from '../services/googleMapsService.js';
import { Op } from 'sequelize';
import { generateReviewsExcel } from '../services/exportService.js';
import { getSettings, saveSettings } from '../services/autoScrapeService.js';

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
      getPageUrl: (page) => getPageUrl(req, page)
    });
  } catch (error) {
    console.error('Reviews page rendering error:', error);
    res.status(500).render('error', {
      message: 'Gagal memuat ulasan',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
}

// Controller to handle Google Maps crawling request
export async function handleCrawlRequest(req, res) {
  try {
    const result = await crawlAndSaveReviews();
    res.json({
      success: true,
      message: `Crawling selesai. Tersimpan: ${result.saved}, Diperbarui: ${result.updated}, Error: ${result.errors}`,
      result
    });
  } catch (error) {
    console.error('Crawling error:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal melakukan crawling ulasan',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
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
    const settings = getSettings();
    res.json(settings);
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