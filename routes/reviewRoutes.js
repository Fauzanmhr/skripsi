import express from 'express';
import { 
  renderReviewsPage, 
  handleCrawlRequest,
  exportReviewsToExcel,
  getAutoScrapeSettings,
  updateAutoScrapeSettings,
  getLatestScrapeStatus,
  handleUpdateGoogleMapsUrl,
  handleFileUpload,
  processFileAnalysis
} from '../controllers/reviewController.js';
import upload from '../middlewares/uploadMiddleware.js';

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

// Route for AJAX polling
router.get('/reviews/latest-status', getLatestScrapeStatus);

// Google Maps URL settings
router.post('/reviews/google-maps-url', handleUpdateGoogleMapsUrl);

// File analyzer routes
router.post('/reviews/analyze/upload', upload.single('file'), handleFileUpload);
router.post('/reviews/analyze/process', processFileAnalysis);

export default router;