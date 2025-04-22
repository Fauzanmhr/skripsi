import express from 'express';
import { renderLoginPage, handleLogin, handleLogout, renderChangePasswordPage, handleChangePassword } from '../controllers/authController.js';
import { isAuthenticated } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Login routes
router.get('/login', renderLoginPage);
router.post('/login', handleLogin);

// Logout route
router.get('/logout', handleLogout);

// Change password routes (authenticated)
router.get('/change-password', isAuthenticated, renderChangePasswordPage);
router.post('/change-password', isAuthenticated, handleChangePassword);

export default router;
