// src/security/index.js
// Main security module exports

const { SecurityConfig } = require('./config.js');
const { ValidationMiddleware } = require('./validation.js');

// Security utilities for easy import
class SecurityUtils {
  static createSecurityStack() {
    const security = new SecurityConfig();
    const validator = new ValidationMiddleware();
    
    return {
      security,
      validator,
      rateLimits: security.getRateLimitConfigs(),
      schemas: ValidationMiddleware.schemas
    };
  }

  // Common validation patterns
  static validateApiRequest(req, res, next) {
    try {
      // Basic API request validation
      if (!req.headers['content-type']?.includes('application/json') && req.method === 'POST') {
        return res.status(400).json({
          success: false,
          error: 'Content-Type must be application/json',
          type: 'invalid_content_type'
        });
      }

      // Check for required user-agent
      if (!req.headers['user-agent']) {
        console.warn(`[SECURITY] Request without User-Agent from IP: ${req.ip}, Path: ${req.path}`);
      }

      next();
    } catch (error) {
      console.error('[SECURITY] Request validation error:', error);
      res.status(500).json({
        success: false,
        error: 'Request validation failed',
        type: 'security_error'
      });
    }
  }

  // Enhanced error handling with security considerations
  static secureErrorHandler(err, req, res, next) {
    // Log the full error for debugging
    console.error('[SECURITY] Error handler:', {
      error: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Sanitize error response based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    
    let errorResponse = {
      success: false,
      error: isProduction ? 'Internal server error' : err.message,
      type: 'server_error'
    };

    // Add stack trace in development only
    if (!isProduction && err.stack) {
      errorResponse.stack = err.stack;
    }

    // Handle specific error types
    if (err.name === 'ValidationError') {
      errorResponse.error = 'Invalid input data';
      errorResponse.type = 'validation_error';
      return res.status(400).json(errorResponse);
    }

    if (err.name === 'UnauthorizedError') {
      errorResponse.error = 'Authentication required';
      errorResponse.type = 'auth_required';
      return res.status(401).json(errorResponse);
    }

    if (err.name === 'ForbiddenError') {
      errorResponse.error = 'Access denied';
      errorResponse.type = 'access_denied';
      return res.status(403).json(errorResponse);
    }

    // Default error response
    res.status(500).json(errorResponse);
  }

  // Rate limit bypass for health checks and specific IPs
  static createRateLimitBypass(allowedIPs = []) {
    return (req, res, next) => {
      // Allow health checks
      if (req.path === '/health' || req.path === '/healthcheck') {
        return next();
      }

      // Allow specific IPs
      if (allowedIPs.includes(req.ip)) {
        return next();
      }

      next();
    };
  }

  // Security headers for specific routes
  static addSecurityHeaders(options = {}) {
    return (req, res, next) => {
      // API-specific headers
      if (req.path.startsWith('/v1/') || req.path.startsWith('/api/')) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-API-Version', '1.0');
        
        if (options.corsOrigin) {
          res.setHeader('Access-Control-Allow-Origin', options.corsOrigin);
        }
      }

      // Dashboard-specific headers
      if (req.path.startsWith('/dashboard') || req.path.startsWith('/login')) {
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      }

      next();
    };
  }

  // IP whitelist/blacklist middleware
  static createIPFilter(options = {}) {
    const { whitelist = [], blacklist = [], mode = 'blacklist' } = options;

    return (req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;

      if (mode === 'whitelist' && whitelist.length > 0) {
        if (!whitelist.includes(clientIP)) {
          console.warn(`[SECURITY] IP ${clientIP} not in whitelist, blocking request to ${req.path}`);
          return res.status(403).json({
            success: false,
            error: 'Access denied',
            type: 'ip_not_allowed'
          });
        }
      }

      if (mode === 'blacklist' && blacklist.includes(clientIP)) {
        console.warn(`[SECURITY] IP ${clientIP} in blacklist, blocking request to ${req.path}`);
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          type: 'ip_blocked'
        });
      }

      next();
    };
  }

  // Request size monitoring
  static monitorRequestSize() {
    return (req, res, next) => {
      const contentLength = req.headers['content-length'];
      
      if (contentLength) {
        const sizeInMB = parseInt(contentLength) / (1024 * 1024);
        
        // Log large requests
        if (sizeInMB > 5) {
          console.warn(`[SECURITY] Large request: ${sizeInMB.toFixed(2)}MB from IP: ${req.ip}, Path: ${req.path}`);
        }
      }

      next();
    };
  }
}

module.exports = {
  SecurityConfig,
  ValidationMiddleware,
  SecurityUtils
};