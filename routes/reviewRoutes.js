import express from 'express';
import { renderReviewsPage, handleCrawlRequest } from '../controllers/reviewController.js';

const router = express.Router();

// Route for the reviews page
router.get('/', renderReviewsPage);

// Route for triggering crawling
router.post('/crawl', handleCrawlRequest);

export default router;