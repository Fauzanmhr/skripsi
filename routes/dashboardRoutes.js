import express from 'express';
import { renderDashboard } from '../controllers/dashboardController.js';

const router = express.Router();

// Route for the dashboard (homepage)
router.get('/', renderDashboard);

export default router;