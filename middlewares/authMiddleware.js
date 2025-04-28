// Middleware untuk autentikasi dan otorisasi pengguna
import User from "../models/user.js";

// Middleware untuk memastikan pengguna telah login, jika belum maka redirect ke halaman login
export const isAuthenticated = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      // Cek apakah user dengan ID yang disimpan di session masih ada di database
      const user = await User.findByPk(req.session.userId);
      if (user) {
        // Jika user ditemukan, simpan data user di request dan locals untuk digunakan di view
        req.user = user;
        res.locals.user = user;
        res.locals.isAuthenticated = true;
        return next(); // Lanjutkan ke middleware atau controller berikutnya
      }
    } catch (error) {
      console.error("Session authentication error:", error);
    }
  }

  // Jika user belum login atau session tidak valid, simpan URL yang dicoba diakses
  // untuk redirect kembali setelah login berhasil
  req.session.returnTo = req.originalUrl;
  res.redirect("/login");
};

// Middleware untuk menyediakan data user di semua view tanpa memerlukan autentikasi
export const setLocals = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      // Cari user berdasarkan ID di session
      const user = await User.findByPk(req.session.userId);
      if (user) {
        // Jika user ditemukan, set data user di request dan locals
        req.user = user;
        res.locals.user = user;
        res.locals.isAuthenticated = true;
      } else {
        // Jika user tidak ditemukan meskipun ada userId di session
        res.locals.user = null;
        res.locals.isAuthenticated = false;
      }
    } catch (error) {
      // Handling error saat mencari user
      console.error("Error setting user locals:", error);
      res.locals.user = null;
      res.locals.isAuthenticated = false;
    }
  } else {
    // Jika tidak ada session atau userId di session
    res.locals.user = null;
    res.locals.isAuthenticated = false;
  }
  next(); // Lanjutkan ke middleware atau controller berikutnya
};
