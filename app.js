import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import morgan from 'morgan';
import dashboardRoutes from './routes/dashboardRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import analyzeRoutes from './routes/analyzeRoutes.js';
import { startSentimentAnalysisJob } from './services/sentimentService.js';
import { initAutoScrapeService } from './services/autoScrapeService.js';
import { sequelize } from './config/database.js';

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Bootstrap CSS and JS
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));
app.use('/icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons/font')));

// Routes
app.use('/', dashboardRoutes, reviewRoutes, analyzeRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error/error', {
    message: 'Something broke!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// 404 handler for wrong paths
app.use((req, res) => {
  res.status(404).render('error/404', {
    message: 'Page not found',
    url: req.url
  });
});

// Database sync and server start
async function startServer() {
  try {
    // Sync database models
    await sequelize.sync();
    console.log('Database synchronized successfully');
    
    // Start the sentiment analysis background job
    startSentimentAnalysisJob();
    
    // Initialize auto scrape service
    initAutoScrapeService();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();