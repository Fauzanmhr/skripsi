import User from '../models/user.js';

// Middleware to check if user is authenticated
export const isAuthenticated = async (req, res, next) => {
  if (req.session && req.session.userId) {
    try {
      const user = await User.findByPk(req.session.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;  // Make sure user is added to locals
        res.locals.isAuthenticated = true;  // Set authentication flag
        return next();
      }
    } catch (error) {
      console.error('Session authentication error:', error);
    }
  }
  
  // Store the URL the user was trying to access
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
};

// Make user available to all templates
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
      console.error('Error setting user locals:', error);
      res.locals.user = null;
      res.locals.isAuthenticated = false;
    }
  } else {
    res.locals.user = null;
    res.locals.isAuthenticated = false;
  }
  next();
};
