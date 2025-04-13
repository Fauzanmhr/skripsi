import express from 'express';
import { 
  renderReviewsPage, 
  handleCrawlRequest,
  exportReviewsToExcel 
} from '../controllers/reviewController.js';

const router = express.Router();

// Route for the reviews page
router.get('/reviews', renderReviewsPage);

// Route for triggering Google Maps crawling
router.post('/reviews/crawl', handleCrawlRequest);

// Route for exporting reviews to Excel
router.get('/reviews/export', exportReviewsToExcel);

export default router;