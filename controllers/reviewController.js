import Review from '../models/review.js';
import { crawlAndSaveReviews } from '../services/googleMapsService.js';
import { Op } from 'sequelize';
import { generateReviewsExcel } from '../services/exportService.js';

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
    const sourceFilter = req.query.source || '';
    const sentimentFilter = req.query.sentiment || '';
    
    // Get all available sources from the database
    const sources = await Review.findAll({
      attributes: ['source'],
      group: ['source'],
      order: [['source', 'ASC']]
    });
    
    // Get all available sentiment values from the database
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
    
    if (sourceFilter) {
      where.source = sourceFilter;
    }
    
    if (sentimentFilter === 'pending') {
      where.sentiment = null;
    } else if (sentimentFilter) {
      where.sentiment = sentimentFilter;
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
    
    // Create a list of distinct sources and sentiments for the filter dropdowns
    const availableSources = sources.map(item => item.source);
    const availableSentiments = sentiments.map(item => item.sentiment);
    
    // Render the reviews page
    res.render('reviews', {
      title: 'Review Data',
      reviews,
      pagination: {
        page,
        limit,
        totalPages,
        totalCount
      },
      filters: {
        source: sourceFilter,
        sentiment: sentimentFilter
      },
      filterOptions: {
        sources: availableSources,
        sentiments: availableSentiments
      },
      page: 'reviews',
      getPageUrl: (page) => getPageUrl(req, page)
    });
  } catch (error) {
    console.error('Reviews page rendering error:', error);
    res.status(500).render('error', {
      message: 'Failed to load reviews',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
}

// Controller to handle Google Maps crawling request
export async function handleCrawlRequest(req, res) {
  try {
    const googleMapsURL = process.env.GOOGLE_MAPS_URL;
    const result = await crawlAndSaveReviews(googleMapsURL);
    res.json({
      success: true,
      message: `Crawling completed. Saved: ${result.saved}, Updated: ${result.updated}, Errors: ${result.errors}`,
      result
    });
  } catch (error) {
    console.error('Crawling error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to crawl reviews',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}

// Controller to export reviews to Excel
export async function exportReviewsToExcel(req, res) {
  try {
    // Extract filter parameters from query
    const { source, sentiment, startDate, endDate } = req.query;
    
    // Build where clause
    const where = {};
    
    if (source) {
      where.source = source;
    }
    
    if (sentiment === 'pending') {
      where.sentiment = null;
    } else if (sentiment) {
      where.sentiment = sentiment;
    }
    
    if (startDate || endDate) {
      where.time_published = {};
      if (startDate) {
        where.time_published[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.time_published[Op.lte] = new Date(endDate);
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
      'attachment; filename=reviews_export.xlsx'
    );
    
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export reviews',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}