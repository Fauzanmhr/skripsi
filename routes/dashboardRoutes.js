// Router untuk endpoint terkait dashboard dengan kontrol akses yang sudah terautentikasi
import express from "express";
import { renderDashboard } from "../controllers/dashboardController.js";

const router = express.Router();

// GET: Render halaman dashboard utama yang menampilkan statistik sentimen dan ulasan terbaru
router.get("/", renderDashboard);

export default router;
