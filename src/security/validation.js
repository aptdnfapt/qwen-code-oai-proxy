// src/security/validation.js
// Input validation middleware

const { SecurityConfig } = require('./config.js');

class ValidationMiddleware {
  constructor() {
    this.security = new SecurityConfig();
  }

  // Validation middleware factory
  validate(schema) {
    return (req, res, next) => {
      try {
        const errors = [];
        const validated = {};

        // Validate request body
        if (schema.body) {
          this.validateObject(req.body || {}, schema.body, 'body', validated, errors);
        }

        // Validate request parameters
        if (schema.params) {
          this.validateObject(req.params || {}, schema.params, 'params', validated, errors);
        }

        // Validate query parameters
        if (schema.query) {
          this.validateObject(req.query || {}, schema.query, 'query', validated, errors);
        }

        if (errors.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            type: 'validation_error',
            details: errors
          });
        }

        // Attach validated data to request
        req.validated = validated;
        next();
      } catch (error) {
        console.error('Validation middleware error:', error);
        res.status(500).json({
          success: false,
          error: 'Validation system error',
          type: 'server_error'
        });
      }
    };
  }

  validateObject(data, schema, section, validated, errors) {
    validated[section] = {};

    for (const [field, rules] of Object.entries(schema)) {
      try {
        const value = data[field];
        
        // Check if field is required
        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push({
            field: `${section}.${field}`,
            message: `${field} is required`,
            type: 'required'
          });
          continue;
        }

        // Skip validation if field is optional and not provided
        if (!rules.required && (value === undefined || value === null || value === '')) {
          continue;
        }

        // Validate using SecurityConfig
        const validatedValue = SecurityConfig.validateInput(value, rules.type, {
          optional: !rules.required,
          ...rules.options
        });

        validated[section][field] = validatedValue;

      } catch (validationError) {
        errors.push({
          field: `${section}.${field}`,
          message: validationError.message,
          type: 'invalid'
        });
      }
    }
  }

  // Pre-defined validation schemas
  static get schemas() {
    return {
      // API Key creation validation
      createApiKey: {
        body: {
          name: { type: 'apiKeyName', required: true },
          description: { type: 'description', required: false },
          permissions: { type: 'permissions', required: true },
          rateLimit: { type: 'rateLimit', required: false }
        }
      },

      // API Key deletion validation
      deleteApiKey: {
        params: {
          keyId: { type: 'apiKeyName', required: true }
        }
      },

      // Account creation validation
      createAccount: {
        body: {
          accountId: { type: 'accountId', required: true }
        }
      },

      // Account deletion validation
      deleteAccount: {
        params: {
          accountId: { type: 'accountId', required: true }
        }
      },

      // OAuth status validation
      oauthStatus: {
        params: {
          deviceCode: { type: 'accountId', required: true } // Using accountId validation for device codes
        }
      },

      // Authentication validation
      login: {
        body: {
          username: { type: 'username', required: true },
          password: { type: 'password', required: true }
        }
      }
    };
  }

  // Sanitization middleware for API responses
  static sanitizeResponse() {
    return (req, res, next) => {
      const originalJson = res.json;
      
      res.json = function(data) {
        // Allow OAuth credentials in setup endpoints
        const isSetupOAuth = req.path && req.path.startsWith('/api/setup/accounts/');
        const sanitized = ValidationMiddleware.sanitizeResponseData(data, isSetupOAuth);
        return originalJson.call(this, sanitized);
      };

      next();
    };
  }

  static sanitizeResponseData(data, allowOAuthCredentials = false) {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // Deep clone to avoid modifying original data
    const sanitized = JSON.parse(JSON.stringify(data));

    // Remove sensitive fields from responses
    let sensitiveFields = [
      'password',
      'secret',
      'token',
      'hash',
      'salt',
      'credentials',
      'access_token',
      'refresh_token'
    ];

    // Add OAuth credentials to sensitive fields unless explicitly allowed
    if (!allowOAuthCredentials) {
      sensitiveFields.push('device_code', 'code_verifier');
    }

    function removeSensitiveFields(obj) {
      if (!obj || typeof obj !== 'object') return obj;

      if (Array.isArray(obj)) {
        return obj.map(removeSensitiveFields);
      }

      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        // Skip sensitive fields
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
          continue;
        }

        if (typeof value === 'object' && value !== null) {
          result[key] = removeSensitiveFields(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return removeSensitiveFields(sanitized);
  }

  // File upload validation middleware
  static validateFileUpload(options = {}) {
    const maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB default
    const allowedTypes = options.allowedTypes || ['image/jpeg', 'image/png', 'image/gif'];

    return (req, res, next) => {
      if (!req.file && !req.files) {
        return next();
      }

      const files = req.files || [req.file];

      for (const file of files) {
        // Check file size
        if (file.size > maxSize) {
          return res.status(400).json({
            success: false,
            error: `File size too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
            type: 'file_too_large'
          });
        }

        // Check file type
        if (!allowedTypes.includes(file.mimetype)) {
          return res.status(400).json({
            success: false,
            error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
            type: 'invalid_file_type'
          });
        }

        // Sanitize filename
        file.originalname = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      }

      next();
    };
  }

  // Request size limiting middleware
  static limitRequestSize(maxSize = 10 * 1024 * 1024) { // 10MB default
    return (req, res, next) => {
      const contentLength = req.headers['content-length'];
      
      if (contentLength && parseInt(contentLength) > maxSize) {
        return res.status(413).json({
          success: false,
          error: 'Request entity too large',
          type: 'request_too_large',
          maxSize: `${maxSize / 1024 / 1024}MB`
        });
      }

      next();
    };
  }

  // SQL injection detection middleware
  static detectSqlInjection() {
    return (req, res, next) => {
      const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
        /(union\s+select)/i,
        /('|(\\x27)|(\\x2D\\x2D)|;)/i,
        /((\%27)|(')|(\-\-)|(%3D))/i
      ];

      function checkValue(value) {
        if (typeof value === 'string') {
          return sqlPatterns.some(pattern => pattern.test(value));
        }
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(checkValue);
        }
        return false;
      }

      const suspicious = checkValue(req.body) || checkValue(req.query) || checkValue(req.params);

      if (suspicious) {
        console.warn(`[SECURITY] Potential SQL injection attempt from IP: ${req.ip}, Path: ${req.path}`);
        return res.status(400).json({
          success: false,
          error: 'Invalid request format',
          type: 'security_violation'
        });
      }

      next();
    };
  }

  // XSS detection middleware
  static detectXss() {
    return (req, res, next) => {
      const xssPatterns = [
        /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
        /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
        /onclick\s*=/gi
      ];

      function checkValue(value) {
        if (typeof value === 'string') {
          return xssPatterns.some(pattern => pattern.test(value));
        }
        if (typeof value === 'object' && value !== null) {
          return Object.values(value).some(checkValue);
        }
        return false;
      }

      const suspicious = checkValue(req.body) || checkValue(req.query) || checkValue(req.params);

      if (suspicious) {
        console.warn(`[SECURITY] Potential XSS attempt from IP: ${req.ip}, Path: ${req.path}`);
        return res.status(400).json({
          success: false,
          error: 'Invalid request format',
          type: 'security_violation'
        });
      }

      next();
    };
  }
}

module.exports = { ValidationMiddleware };