// Router untuk endpoint terkait ulasan (reviews) dengan kontrol akses yang sudah terautentikasi
import express from "express";
import {
  renderReviewsPage,
  handleCrawlRequest,
  exportReviewsToExcel,
  getAutoScrapeSettings,
  updateAutoScrapeSettings,
  handleUpdateGoogleMapsUrl,
  handleFileUpload,
  processFileAnalysis,
} from "../controllers/reviewController.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

// GET: Render halaman utama untuk menampilkan ulasan dengan filter dan pagination
router.get("/reviews", renderReviewsPage);

// POST: Memulai proses crawling/scraping ulasan dari Google Maps
router.post("/reviews/crawl", handleCrawlRequest);

// GET: Mengekspor data ulasan ke format Excel dengan filter yang sama seperti halaman utama
router.get("/reviews/export", exportReviewsToExcel);

// GET: Mendapatkan pengaturan scrape otomatis saat ini
router.get("/reviews/auto-scrape-settings", getAutoScrapeSettings);
// POST: Mengupdate status aktif/nonaktif scrape otomatis
router.post("/reviews/auto-scrape-settings", updateAutoScrapeSettings);

// POST: Mengupdate URL Google Maps yang akan di-scrape
router.post("/reviews/google-maps-url", handleUpdateGoogleMapsUrl);

// POST: Upload file (CSV/Excel) untuk dianalisis sentimen - menggunakan middleware multer
router.post("/reviews/analyze/upload", upload.single("file"), handleFileUpload);
// POST: Memproses kolom teks dari file yang sudah diupload untuk analisis sentimen
router.post("/reviews/analyze/process", processFileAnalysis);

export default router;
