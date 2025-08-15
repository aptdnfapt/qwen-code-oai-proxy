// src/dashboard/middleware/auth.js
// Dashboard authentication middleware for session validation

const config = require('../../config.js');
const rateLimit = require('express-rate-limit');

class DashboardAuthMiddleware {
  constructor() {
    // Initialize rate limiter for login attempts
    this.loginLimiter = rateLimit({
      windowMs: config.dashboard.rateLimit.windowMs, // 15 minutes
      max: config.dashboard.rateLimit.maxAttempts, // 5 attempts
      message: {
        error: 'Too many login attempts. Please try again later.',
        type: 'rate_limit_exceeded'
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Only apply to login endpoint
      skip: (req) => !req.path.includes('/auth/login')
    });
  }

  // Rate limiting middleware for login
  getLoginRateLimit() {
    return this.loginLimiter;
  }

  // Middleware to verify dashboard session
  requireAuth(req, res, next) {
    try {
      // Check for valid session
      if (req.session && req.session.authenticated && req.session.user) {
        // Update session activity timestamp
        req.session.lastActivity = new Date().toISOString();
        return next();
      }
      
      // No valid session - handle based on request type
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ 
          error: 'Authentication required',
          type: 'authentication_required' 
        });
      }
      
      // Redirect to login for dashboard pages
      return res.redirect('/login');
    } catch (error) {
      console.error('Authentication middleware error:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        type: 'server_error' 
      });
    }
  }

  // Middleware to redirect authenticated users from login page
  redirectIfAuthenticated(req, res, next) {
    try {
      if (req.session && req.session.authenticated) {
        return res.redirect('/dashboard');
      }
      next();
    } catch (error) {
      console.error('Redirect middleware error:', error);
      next(); // Continue to login page on error
    }
  }

  // Middleware to check session timeout
  checkSessionTimeout(req, res, next) {
    try {
      if (req.session && req.session.authenticated) {
        const lastActivity = new Date(req.session.lastActivity || req.session.loginTime);
        const now = new Date();
        const timeDiff = now - lastActivity;
        
        // Check if session has timed out
        if (timeDiff > config.dashboard.sessionTimeout) {
          req.session.destroy((err) => {
            if (err) {
              console.error('Session destruction error:', err);
            }
          });
          
          if (req.path.startsWith('/api/')) {
            return res.status(401).json({ 
              error: 'Session expired',
              type: 'session_expired' 
            });
          }
          
          return res.redirect('/login?message=session_expired');
        }
        
        // Update last activity
        req.session.lastActivity = now.toISOString();
      }
      
      next();
    } catch (error) {
      console.error('Session timeout check error:', error);
      next(); // Continue on error
    }
  }

  // Validate credentials against configuration
  validateCredentials(username, password) {
    try {
      // Use constant-time comparison to prevent timing attacks
      const validUsername = config.dashboard.user;
      const validPassword = config.dashboard.password;
      
      const usernameMatch = username === validUsername;
      const passwordMatch = password === validPassword;
      
      return usernameMatch && passwordMatch;
    } catch (error) {
      console.error('Credential validation error:', error);
      return false;
    }
  }

  // Create secure session
  createSession(req, username) {
    try {
      req.session.authenticated = true;
      req.session.user = username;
      req.session.loginTime = new Date().toISOString();
      req.session.lastActivity = new Date().toISOString();
      
      // Regenerate session ID for security
      return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            reject(err);
          } else {
            // Restore session data after regeneration
            req.session.authenticated = true;
            req.session.user = username;
            req.session.loginTime = new Date().toISOString();
            req.session.lastActivity = new Date().toISOString();
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('Session creation error:', error);
      throw error;
    }
  }

  // Destroy session securely
  destroySession(req) {
    return new Promise((resolve, reject) => {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = { DashboardAuthMiddleware };