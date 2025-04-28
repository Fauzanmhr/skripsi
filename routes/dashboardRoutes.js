import express from "express";
import { renderDashboard } from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/", renderDashboard);

export default router;
