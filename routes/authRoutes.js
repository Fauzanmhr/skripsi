// Router untuk endpoint terkait autentikasi (login, logout, ganti password)
import express from "express";
import {
  renderLoginPage,
  handleLogin,
  handleLogout,
  renderChangePasswordPage,
  handleChangePassword,
} from "../controllers/authController.js";
import { isAuthenticated } from "../middlewares/authMiddleware.js";

const router = express.Router();

// GET: Render halaman login
router.get("/login", renderLoginPage);
// POST: Proses form login, autentikasi user
router.post("/login", handleLogin);

// GET: Proses logout user, hapus session
router.get("/logout", handleLogout);

// GET: Render halaman ganti password (memerlukan login)
router.get("/change-password", isAuthenticated, renderChangePasswordPage);
// POST: Proses form ganti password (memerlukan login)
router.post("/change-password", isAuthenticated, handleChangePassword);

export default router;
