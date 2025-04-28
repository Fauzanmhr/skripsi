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

router.get("/login", renderLoginPage);
router.post("/login", handleLogin);

router.get("/logout", handleLogout);

router.get("/change-password", isAuthenticated, renderChangePasswordPage);
router.post("/change-password", isAuthenticated, handleChangePassword);

export default router;
