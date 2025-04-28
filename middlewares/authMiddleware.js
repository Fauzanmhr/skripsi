import User from "../models/user.js";

export const isAuthenticated = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findByPk(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;
        res.locals.isAuthenticated = true;
        return next();
      }
    } catch (error) {
      console.error("Session authentication error:", error);
    }
  }

  req.session.returnTo = req.originalUrl;
  res.redirect("/login");
};

export const setLocals = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findByPk(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;
        res.locals.isAuthenticated = true;
      } else {
        res.locals.user = null;
        res.locals.isAuthenticated = false;
      }
    } catch (error) {
      console.error("Error setting user locals:", error);
      res.locals.user = null;
      res.locals.isAuthenticated = false;
    }
  } else {
    res.locals.user = null;
    res.locals.isAuthenticated = false;
  }
  next();
};
