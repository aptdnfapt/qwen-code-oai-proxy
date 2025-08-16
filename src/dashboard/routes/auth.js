// src/dashboard/routes/auth.js
// Dashboard authentication routes

const express = require('express');
const { ValidationMiddleware } = require('../../security/validation.js');
const router = express.Router();
const config = require('../../config.js');

class AuthRoutes {
  constructor(dashboardAuthMiddleware) {
    this.dashboardAuth = dashboardAuthMiddleware;
    this.setupRoutes();
  }

  setupRoutes() {
    // POST /api/auth/login - Dashboard login with rate limiting and validation
    router.post('/login', 
      this.dashboardAuth.getLoginRateLimit(),
      ValidationMiddleware.prototype.validate(ValidationMiddleware.schemas.login),
      async (req, res) => {
        try {
          // Use validated data from middleware (already sanitized and validated)
          const { username, password } = req.validated.body;

          // Validate credentials
          const isValid = this.dashboardAuth.validateCredentials(username, password);
          
          if (!isValid) {
            // Log failed attempt
            console.warn(`Failed login attempt for user: ${username} from IP: ${req.ip}`);
            
            return res.status(401).json({
              success: false,
              error: 'Invalid username or password',
              type: 'authentication_error'
            });
          }

          // Create secure session
          await this.dashboardAuth.createSession(req, username);
          
          // Log successful login
          console.log(`Successful login for user: ${username} from IP: ${req.ip}`);
          
          res.json({
            success: true,
            message: 'Login successful',
            user: {
              username: username,
              loginTime: req.session.loginTime
            }
          });

        } catch (error) {
          console.error('Login error:', error);
          res.status(500).json({
            success: false,
            error: 'Internal server error during login',
            type: 'server_error'
          });
        }
      }
    );

    // POST /api/auth/logout - Dashboard logout
    router.post('/logout', async (req, res) => {
      try {
        const username = req.session?.user;
        
        // Destroy session
        await this.dashboardAuth.destroySession(req);
        
        // Log logout
        if (username) {
          console.log(`User ${username} logged out from IP: ${req.ip}`);
        }
        
        res.json({
          success: true,
          message: 'Logout successful'
        });

      } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
          success: false,
          error: 'Logout failed',
          type: 'server_error'
        });
      }
    });

    // GET /api/auth/verify - Verify authentication status
    router.get('/verify', (req, res) => {
      try {
        if (req.session && req.session.authenticated && req.session.user) {
          // Calculate session info
          const loginTime = new Date(req.session.loginTime);
          const lastActivity = new Date(req.session.lastActivity || req.session.loginTime);
          const now = new Date();
          
          const sessionDuration = now - loginTime;
          const timeSinceActivity = now - lastActivity;
          const timeUntilExpiry = config.dashboard.sessionTimeout - timeSinceActivity;
          
          res.json({
            success: true,
            authenticated: true,
            user: {
              username: req.session.user,
              loginTime: req.session.loginTime,
              lastActivity: req.session.lastActivity,
              sessionDuration: Math.floor(sessionDuration / 1000), // seconds
              timeUntilExpiry: Math.max(0, Math.floor(timeUntilExpiry / 1000)) // seconds
            }
          });
        } else {
          res.json({
            success: true,
            authenticated: false,
            message: 'No active session'
          });
        }
      } catch (error) {
        console.error('Auth verification error:', error);
        res.status(500).json({
          success: false,
          error: 'Error verifying authentication',
          type: 'server_error'
        });
      }
    });

    // POST /api/auth/refresh - Refresh session (extend timeout)
    router.post('/refresh', 
      this.dashboardAuth.requireAuth.bind(this.dashboardAuth),
      (req, res) => {
        try {
          // Update session activity to extend timeout
          req.session.lastActivity = new Date().toISOString();
          
          const timeUntilExpiry = config.dashboard.sessionTimeout;
          
          res.json({
            success: true,
            message: 'Session refreshed',
            timeUntilExpiry: Math.floor(timeUntilExpiry / 1000)
          });
        } catch (error) {
          console.error('Session refresh error:', error);
          res.status(500).json({
            success: false,
            error: 'Error refreshing session',
            type: 'server_error'
          });
        }
      }
    );

    // GET /api/auth/session-info - Get detailed session information
    router.get('/session-info',
      this.dashboardAuth.requireAuth.bind(this.dashboardAuth),
      (req, res) => {
        try {
          const loginTime = new Date(req.session.loginTime);
          const lastActivity = new Date(req.session.lastActivity || req.session.loginTime);
          const now = new Date();
          
          res.json({
            success: true,
            session: {
              user: req.session.user,
              loginTime: req.session.loginTime,
              lastActivity: req.session.lastActivity,
              sessionDuration: Math.floor((now - loginTime) / 1000),
              timeUntilExpiry: Math.max(0, Math.floor((config.dashboard.sessionTimeout - (now - lastActivity)) / 1000)),
              maxSessionTime: Math.floor(config.dashboard.sessionTimeout / 1000),
              clientIP: req.ip,
              userAgent: req.get('User-Agent')
            }
          });
        } catch (error) {
          console.error('Session info error:', error);
          res.status(500).json({
            success: false,
            error: 'Error getting session information',
            type: 'server_error'
          });
        }
      }
    );
  }

  getRouter() {
    return router;
  }
}

module.exports = { AuthRoutes };