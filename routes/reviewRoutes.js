import express from 'express';
import { 
  renderReviewsPage, 
  handleCrawlRequest, 
  handleSheetsCrawlRequest,
  exportReviewsToExcel 
} from '../controllers/reviewController.js';

const router = express.Router();

// Route for the reviews page
router.get('/', renderReviewsPage);

// Route for triggering Google Maps crawling
router.post('/crawl', handleCrawlRequest);

// Route for triggering Google Sheets crawling
router.post('/crawl-sheets', handleSheetsCrawlRequest);

// Route for exporting reviews to Excel
router.get('/export', exportReviewsToExcel);

export default router;