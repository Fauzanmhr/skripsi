// File utama untuk konfigurasi dan inisialisasi aplikasi Express.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import morgan from "morgan";
import session from "express-session";
import SequelizeStore from "connect-session-sequelize";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { startSentimentAnalysisJob } from "./services/sentimentService.js";
import {
  initAutoScrapeService,
  resetStaleScrapesOnStartup,
} from "./services/autoScrapeService.js";
import { sequelize } from "./config/database.js";
import { isAuthenticated, setLocals } from "./middlewares/authMiddleware.js";
import { createInitialUser } from "./controllers/authController.js";
import { initializeGoogleMapsSetting } from "./services/googleMapsService.js";

// Konfigurasi path untuk metode import ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Muat variabel environment dari file .env
dotenv.config();

// Konfigurasi penyimpanan sesi menggunakan Sequelize
const SessionStore = SequelizeStore(session.Store);
const sessionStore = new SessionStore({
  db: sequelize,
});

// Inisialisasi aplikasi Express
const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi HTTP server
const server = http.createServer(app);

// Inisialisasi koneksi Socket.io
export const io = new Server(server);

// Handler koneksi Socket.io
io.on("connection", (socket) => {
  console.log("Client connected to Socket.io");

  socket.on("disconnect", () => {
    console.log("Client disconnected from Socket.io");
  });
});

// Konfigurasi aplikasi
app.set("trust proxy", 1);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware untuk parsing request dan logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Konfigurasi middleware session
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // Sesi bertahan 1 hari
      secure: process.env.NODE_ENV === "production", // Gunakan HTTPS di production
    },
  }),
);

// Middleware untuk menyediakan informasi user di semua view
app.use(setLocals);

// Middleware untuk file statis
app.use(express.static(path.join(__dirname, "public")));

// Setup path untuk file static dari node_modules
app.use(
  "/css",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/css")),
);
app.use(
  "/js",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/js")),
);
app.use(
  "/js",
  express.static(path.join(__dirname, "node_modules/chart.js/dist")),
);
app.use(
  "/icons",
  express.static(path.join(__dirname, "node_modules/bootstrap-icons/font")),
);

// Routing
// 1. Routes yang tidak memerlukan otentikasi
app.use("/", authRoutes);
// 2. Routes yang memerlukan otentikasi
app.use("/", isAuthenticated, dashboardRoutes, reviewRoutes);

// Error handlers
// 1. Middleware error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error/error", {
    message: "Something broke!",
    error: process.env.NODE_ENV === "development" ? err : {}, // Tampilkan error detail hanya di development
  });
});

// 2. Middleware 404 handler
app.use((req, res) => {
  res.status(404).render("error/404", {
    message: "Page not found",
    url: req.url,
  });
});

// Fungsi untuk menginisialisasi server dan database
async function startServer() {
  try {
    // Sinkronisasi model dengan database
    await sequelize.sync();
    await sessionStore.sync();
    console.log("Database synchronized successfully");

    // Membuat user admin default jika belum ada
    await createInitialUser();

    // Reset status scrape yang terganggu saat server restart
    await resetStaleScrapesOnStartup();

    // Mulai background job untuk analisis sentimen otomatis
    startSentimentAnalysisJob();

    // Inisialisasi service scrape otomatis
    initAutoScrapeService();

    // Inisialisasi setelan Google Maps
    await initializeGoogleMapsSetting();

    // Start the HTTP server instead of the Express app directly
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Mulai server
startServer();
