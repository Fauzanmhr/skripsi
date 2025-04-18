import express from 'express';
import { 
  renderReviewsPage, 
  handleCrawlRequest,
  exportReviewsToExcel,
  getAutoScrapeSettings,
  updateAutoScrapeSettings
} from '../controllers/reviewController.js';

const router = express.Router();

// Route for the reviews page
router.get('/reviews', renderReviewsPage);

// Route for triggering Google Maps crawling
router.post('/reviews/crawl', handleCrawlRequest);

// Route for exporting reviews to Excel
router.get('/reviews/export', exportReviewsToExcel);

// Routes for auto scrape settings
router.get('/reviews/auto-scrape-settings', getAutoScrapeSettings);
router.post('/reviews/auto-scrape-settings', updateAutoScrapeSettings);

export default router;