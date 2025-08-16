// src/security/config.js
// Security configuration and hardening

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');

class SecurityConfig {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  // Enhanced Helmet configuration
  getHelmetConfig() {
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: this.isDevelopment ? 
            ["'self'", "'unsafe-inline'", "'unsafe-eval'"] : 
            ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
          imgSrc: ["'self'", "data:", "https:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          workerSrc: ["'self'"],
          childSrc: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          manifestSrc: ["'self'"]
        },
        reportOnly: this.isDevelopment
      },
      crossOriginEmbedderPolicy: { policy: "require-corp" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: this.isProduction ? {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      } : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: ["no-referrer", "strict-origin-when-cross-origin"] },
      xssFilter: true
    };
  }

  // Rate limiting configurations
  getRateLimitConfigs() {
    return {
      // General API rate limiting
      api: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: this.isProduction ? 100 : 1000, // requests per window
        message: {
          error: {
            message: 'Too many requests from this IP, please try again later.',
            type: 'rate_limit_exceeded',
            retryAfter: '15 minutes'
          }
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
          res.status(429).json({
            error: {
              message: 'Too many requests from this IP, please try again later.',
              type: 'rate_limit_exceeded',
              retryAfter: 900 // 15 minutes in seconds
            }
          });
        }
      }),

      // Strict rate limiting for authentication endpoints
      auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: this.isProduction ? 5 : 50, // Very restrictive for auth
        message: {
          error: {
            message: 'Too many authentication attempts, please try again later.',
            type: 'auth_rate_limit_exceeded',
            retryAfter: '15 minutes'
          }
        },
        skipSuccessfulRequests: true,
        handler: (req, res) => {
          console.warn(`Auth rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
          res.status(429).json({
            error: {
              message: 'Too many authentication attempts, please try again later.',
              type: 'auth_rate_limit_exceeded',
              retryAfter: 900
            }
          });
        }
      }),

      // Rate limiting for API key operations
      apiKeys: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: this.isProduction ? 20 : 10000, // API key operations per 15 minutes (high for dev)
        message: {
          error: {
            message: 'Too many API key operations, please try again later.',
            type: 'api_key_rate_limit_exceeded',
            retryAfter: '1 hour'
          }
        },
        handler: (req, res) => {
          console.warn(`API key rate limit exceeded for IP: ${req.ip}, User: ${req.session?.user}`);
          res.status(429).json({
            error: {
              message: 'Too many API key operations, please try again later.',
              type: 'api_key_rate_limit_exceeded',
              retryAfter: 3600
            }
          });
        }
      }),

      // Rate limiting for OAuth operations
      oauth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: this.isProduction ? 100 : 500, // OAuth polling requests per 15 minutes
        message: {
          error: {
            message: 'Too many OAuth attempts, please try again later.',
            type: 'oauth_rate_limit_exceeded',
            retryAfter: '15 minutes'
          }
        },
        handler: (req, res) => {
          console.warn(`OAuth rate limit exceeded for IP: ${req.ip}`);
          res.status(429).json({
            error: {
              message: 'Too many OAuth attempts, please try again later.',
              type: 'oauth_rate_limit_exceeded',
              retryAfter: 900
            }
          });
        }
      })
    };
  }

  // Input validation utilities
  static validateInput(input, type, options = {}) {
    if (!input && !options.optional) {
      throw new Error(`${type} is required`);
    }

    if (!input && options.optional) {
      return null;
    }

    const value = String(input).trim();

    switch (type) {
      case 'accountId':
        if (!validator.isLength(value, { min: 1, max: 100 })) {
          throw new Error('Account ID must be 1-100 characters long');
        }
        if (!validator.isAlphanumeric(value, 'en-US', { ignore: '-_' })) {
          throw new Error('Account ID can only contain letters, numbers, hyphens, and underscores');
        }
        return value;

      case 'apiKeyName':
        if (!validator.isLength(value, { min: 1, max: 200 })) {
          throw new Error('API key name must be 1-200 characters long');
        }
        if (!validator.matches(value, /^[a-zA-Z0-9\s\-_]+$/)) {
          throw new Error('API key name contains invalid characters');
        }
        return value;

      case 'description':
        if (!validator.isLength(value, { min: 0, max: 1000 })) {
          throw new Error('Description must be less than 1000 characters');
        }
        return validator.escape(value);

      case 'permissions':
        const validPermissions = ['chat.completions', 'models.list', 'full_access'];
        if (!Array.isArray(input)) {
          throw new Error('Permissions must be an array');
        }
        const sanitized = input.filter(p => validPermissions.includes(p));
        if (sanitized.length === 0) {
          throw new Error('At least one valid permission is required');
        }
        return sanitized;

      case 'username':
        if (!validator.isLength(value, { min: 1, max: 50 })) {
          throw new Error('Username must be 1-50 characters long');
        }
        if (!validator.isAlphanumeric(value, 'en-US', { ignore: '-_' })) {
          throw new Error('Username can only contain letters, numbers, hyphens, and underscores');
        }
        return value;

      case 'password':
        if (!validator.isLength(value, { min: 1, max: 500 })) {
          throw new Error('Password must be 1-500 characters long');
        }
        return value; // Don't escape passwords

      case 'rateLimit':
        const num = parseInt(value);
        if (!validator.isInt(String(num), { min: 1, max: 10000 })) {
          throw new Error('Rate limit must be between 1 and 10000');
        }
        return num;

      default:
        throw new Error(`Unknown validation type: ${type}`);
    }
  }

  // Sanitize error messages for client responses
  static sanitizeError(error, context = 'general') {
    const message = error.message || 'An error occurred';
    
    // Remove sensitive information from error messages
    const sensitivePatterns = [
      /password/gi,
      /token/gi,
      /secret/gi,
      /key/gi,
      /hash/gi,
      /salt/gi,
      /auth/gi,
      /credential/gi
    ];

    let sanitized = message;
    sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Context-specific error handling
    switch (context) {
      case 'auth':
        if (message.includes('invalid') || message.includes('failed')) {
          return 'Invalid credentials';
        }
        break;
      case 'validation':
        // Keep validation messages as they're user-facing
        return message;
      case 'database':
        return 'Data operation failed';
      case 'external':
        return 'External service error';
    }

    return sanitized;
  }

  // Session security configuration
  getSessionConfig() {
    return {
      secret: process.env.DASHBOARD_SESSION_SECRET || 'change-this-secret-in-production',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        secure: false, // Set to true only when using HTTPS
        httpOnly: true,
        maxAge: parseInt(process.env.DASHBOARD_SESSION_TIMEOUT) || 1800000, // 30 minutes
        sameSite: 'lax' // Less restrictive for proxy environments
      },
      name: 'qwen-session',
      genid: () => {
        return require('crypto').randomBytes(16).toString('hex');
      }
    };
  }

  // CORS configuration
  getCorsConfig() {
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : 
      ['http://localhost:3000', 'http://127.0.0.1:3000'];

    return {
      origin: this.isProduction ? allowedOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      maxAge: 86400 // 24 hours
    };
  }

  // Security headers middleware
  securityHeaders() {
    return (req, res, next) => {
      // Additional security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      
      if (this.isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
      }

      next();
    };
  }

  // Request sanitization middleware
  sanitizeRequest() {
    return (req, res, next) => {
      // Remove potentially dangerous headers
      delete req.headers['x-forwarded-host'];
      delete req.headers['x-real-ip'];
      
      // Limit request size
      if (req.headers['content-length'] && parseInt(req.headers['content-length']) > 10 * 1024 * 1024) {
        return res.status(413).json({
          error: {
            message: 'Request entity too large',
            type: 'request_too_large'
          }
        });
      }

      next();
    };
  }

  // Audit logging middleware
  auditLogger() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log sensitive operations
      const sensitiveOps = ['/api/auth/login', '/api/keys', '/api/accounts'];
      const isSensitive = sensitiveOps.some(op => req.path.startsWith(op));

      if (isSensitive) {
        console.log(`[AUDIT] ${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip} - User: ${req.session?.user || 'anonymous'}`);
      }

      // Override res.json to log response status for sensitive operations
      if (isSensitive) {
        const originalJson = res.json;
        res.json = function(data) {
          const duration = Date.now() - startTime;
          const success = res.statusCode < 400;
          console.log(`[AUDIT] ${new Date().toISOString()} - ${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${duration}ms - Success: ${success}`);
          return originalJson.call(this, data);
        };
      }

      next();
    };
  }
}

module.exports = { SecurityConfig };