import express from "express";
import {
  renderReviewsPage,
  handleCrawlRequest,
  exportReviewsToExcel,
  getAutoScrapeSettings,
  updateAutoScrapeSettings,
  getLatestScrapeStatus,
  handleUpdateGoogleMapsUrl,
  handleFileUpload,
  processFileAnalysis,
} from "../controllers/reviewController.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.get("/reviews", renderReviewsPage);

router.post("/reviews/crawl", handleCrawlRequest);

router.get("/reviews/export", exportReviewsToExcel);

router.get("/reviews/auto-scrape-settings", getAutoScrapeSettings);
router.post("/reviews/auto-scrape-settings", updateAutoScrapeSettings);

router.get("/reviews/latest-status", getLatestScrapeStatus);

router.post("/reviews/google-maps-url", handleUpdateGoogleMapsUrl);

router.post("/reviews/analyze/upload", upload.single("file"), handleFileUpload);
router.post("/reviews/analyze/process", processFileAnalysis);

export default router;
