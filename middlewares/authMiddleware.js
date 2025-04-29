// Middleware untuk autentikasi dan otorisasi pengguna

// Middleware untuk memastikan pengguna telah login
export const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  req.session.returnTo = req.originalUrl;
  res.redirect("/login");
};

// Middleware untuk menyediakan data user di semua view
export const setLocals = (req, res, next) => {
  res.locals.user = req.user;
  res.locals.isAuthenticated = req.isAuthenticated();
  next();
};
