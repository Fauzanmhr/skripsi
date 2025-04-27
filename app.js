import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import morgan from 'morgan';
import session from 'express-session';
import SequelizeStore from 'connect-session-sequelize';
import dashboardRoutes from './routes/dashboardRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { startSentimentAnalysisJob } from './services/sentimentService.js';
import { initAutoScrapeService, resetStaleScrapesOnStartup } from './services/autoScrapeService.js';
import { sequelize } from './config/database.js';
import { isAuthenticated, setLocals } from './middlewares/authMiddleware.js';
import { createInitialUser } from './controllers/authController.js';
import { initializeGoogleMapsSetting } from './services/googleMapsService.js'; // Renamed import

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (e.g., Cloudflare, Nginx)
app.set('trust proxy', 1);

// Setup session store
const SessionStore = SequelizeStore(session.Store);
const sessionStore = new SessionStore({
  db: sequelize,
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  proxy: true, // Trust reverse proxy (e.g., Cloudflare, Nginx)
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    secure: process.env.NODE_ENV === 'production'
  }
}));

//  middleware to set user and authentication status in locals
app.use(setLocals);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Bootstrap CSS and JS
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));
app.use('/icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons/font')));

// Auth routes (no authentication required)
app.use('/', authRoutes);

// Protected routes
app.use('/', isAuthenticated, dashboardRoutes, reviewRoutes);

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
    // Sync database models and session store
    await sequelize.sync();
    await sessionStore.sync();
    console.log('Database synchronized successfully');

    // Create initial user if not exists
    await createInitialUser();

    // Reset any stale 'running' scrape statuses on startup
    await resetStaleScrapesOnStartup();

    // Start the sentiment analysis background job
    startSentimentAnalysisJob();

    // Initialize auto scrape service
    initAutoScrapeService();

    // Initialize Google Maps URL
    await initializeGoogleMapsSetting(); // Renamed function call

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