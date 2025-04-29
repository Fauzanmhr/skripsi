// Controller untuk autentikasi dan manajemen user
import User from "../models/user.js";
import passport from 'passport';

// Render halaman login, redirect ke dashboard jika sudah login
export function renderLoginPage(req, res) {
  if (req.isAuthenticated()) {
    return res.redirect("/");
  }
  res.render("auth/login", {
    title: "Login",
    page: "login",
    error: req.query.error,
  });
}

// Proses autentikasi user saat login menggunakan Passport.js
export function handleLogin(req, res, next) {
  passport.authenticate('local', (err, user, info) => {
    // Error handling untuk kesalahan server
    if (err) { 
      console.error("Login error:", err);
      return res.redirect("/login?error=Gagal+login.+Silakan+coba+lagi");
    }
    
    // Jika autentikasi gagal
    if (!user) {
      return res.redirect(`/login?error=${encodeURIComponent(info.message || 'Username atau password salah')}`);
    }
    
    // Jika autentikasi berhasil, log in user
    req.logIn(user, (err) => {
      if (err) { 
        console.error("Login error:", err);
        return res.redirect("/login?error=Gagal+login.+Silakan+coba+lagi");
      }
      
      // Redirect ke URL yang diminta sebelumnya atau dashboard
      const returnTo = req.session.returnTo || "/";
      delete req.session.returnTo;
      return res.redirect(returnTo);
    });
  })(req, res, next);
}

// Proses logout user menggunakan Passport.js
export function handleLogout(req, res, next) {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return next(err);
    }
    res.redirect("/login");
  });
}

// Membuat user admin default jika belum ada user di database
export async function createInitialUser() {
  try {
    const userCount = await User.count();

    if (userCount === 0) {
      await User.create({
        username: "admin",
        password: "admin",
      });
      console.log("Initial user created");
    }
  } catch (error) {
    console.error("Error creating initial user:", error);
  }
}

// Render halaman ganti password
export function renderChangePasswordPage(req, res) {
  res.render("auth/change-password", {
    title: "Change Password",
    page: "change-password",
    success: req.query.success,
    error: req.query.error,
  });
}

// Proses ganti password user
export async function handleChangePassword(req, res) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validasi input data
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.redirect("/change-password?error=Semua+field+harus+diisi");
    }

    // Validasi password baru sama dengan konfirmasi password
    if (newPassword !== confirmPassword) {
      return res.redirect("/change-password?error=Password+baru+tidak+cocok+dengan+konfirmasi");
    }

    // Validasi password baru berbeda dengan password lama
    if (currentPassword === newPassword) {
      return res.redirect(
        "/change-password?error=Password+baru+harus+berbeda+dengan+password+lama",
      );
    }

    // Validasi password lama benar
    const user = await User.findByPk(req.user.id);
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.redirect(
        "/change-password?error=Password+lama+tidak+benar",
      );
    }

    // Simpan password baru
    user.password = newPassword;
    await user.save();

    res.redirect("/change-password?success=Password+berhasil+diubah");
  } catch (error) {
    console.error("Change password error:", error);
    res.redirect("/change-password?error=Gagal+mengubah+password");
  }
}
