import Review from '../models/review.js';
import ReviewExtra from '../models/review_extra.js';
import { crawlAndSaveReviews } from '../services/googleMapsService.js';
import { processGoogleSheetsData } from '../services/googleSheetsService.js';

// Helper function to generate pagination URLs
function getPageUrl(req, page) {
  const protocol = req.protocol;
  const host = req.get('host');
  const baseUrl = `${protocol}://${host}${req.baseUrl}`;
  const url = new URL(baseUrl);
  url.searchParams.set('page', page);
  return url.search;
}

// Controller to render the reviews page with pagination
export async function renderReviewsPage(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get total count for pagination
    const totalCount = await Review.count();
    
    // Get reviews with pagination (including extra data if available)
    const reviews = await Review.findAll({
      include: [{ model: ReviewExtra, required: false }],
      order: [['time_published', 'DESC']],
      limit,
      offset
    });
    
    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    
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
    
    // Start crawling process
    const result = await crawlAndSaveReviews(googleMapsURL);
    
    // Return JSON response with results
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

// Controller to handle Google Sheets crawling request
export async function handleSheetsCrawlRequest(req, res) {
  try {
    const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
    
    // Start sheets processing
    const result = await processGoogleSheetsData(sheetsUrl);
    
    // Return JSON response with results
    res.json({
      success: true,
      message: `Google Sheets processing completed. Saved: ${result.saved}, Updated: ${result.updated}, Errors: ${result.errors}`,
      result
    });
  } catch (error) {
    console.error('Google Sheets processing error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process Google Sheets data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error'
    });
  }
}