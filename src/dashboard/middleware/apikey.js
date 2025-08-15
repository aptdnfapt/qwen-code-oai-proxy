// src/dashboard/middleware/apikey.js
// API key validation middleware for /v1/* routes

const rateLimit = require('express-rate-limit');

class ApiKeyMiddleware {
  constructor(apiKeyManager) {
    this.apiKeyManager = apiKeyManager;
    this.keyRateLimiters = new Map(); // Store rate limiters per API key
  }

  // Create rate limiter for specific API key
  createKeyRateLimit(rateConfig) {
    if (!rateConfig) {
      return null; // No rate limiting
    }
    
    return rateLimit({
      windowMs: rateConfig.windowMs || 60000, // 1 minute default
      max: rateConfig.maxRequests || 100, // 100 requests default
      message: {
        error: {
          message: 'Rate limit exceeded for this API key',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded'
        }
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.apiKey?.id || req.ip
    });
  }

  // Middleware to validate API keys for /v1/* routes
  validateApiKey() {
    return async (req, res, next) => {
      const startTime = Date.now();
      
      try {
        const authHeader = req.headers.authorization;
        
        // Check for Authorization header
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({
            error: {
              message: 'You must provide an API key in the Authorization header',
              type: 'invalid_request_error',
              code: 'missing_authorization'
            }
          });
        }

        const apiKey = authHeader.replace('Bearer ', '').trim();
        
        // Basic format validation
        if (!apiKey.startsWith('sk-proj-') || apiKey.length < 20) {
          return res.status(401).json({
            error: {
              message: 'Invalid API key format. Expected format: sk-proj-...',
              type: 'invalid_request_error',
              code: 'invalid_api_key'
            }
          });
        }

        // Validate API key against stored hashes
        const keyData = await this.apiKeyManager.validateKey(apiKey);
        
        if (!keyData) {
          return res.status(401).json({
            error: {
              message: 'Invalid API key provided',
              type: 'invalid_request_error', 
              code: 'invalid_api_key'
            }
          });
        }

        // Check if key is active
        if (keyData.status === 'revoked' || keyData.status === 'disabled') {
          return res.status(401).json({
            error: {
              message: 'API key has been revoked or disabled',
              type: 'invalid_request_error',
              code: 'api_key_disabled'
            }
          });
        }

        // Attach key data to request for logging and permission checks
        req.apiKey = keyData;
        req.apiKeyValidationTime = Date.now() - startTime;
        
        // Check permissions for this endpoint
        const hasPermission = this.checkPermissions(req, keyData.permissions);
        if (!hasPermission) {
          return res.status(403).json({
            error: {
              message: 'API key does not have permission for this endpoint',
              type: 'permission_error',
              code: 'insufficient_permissions'
            }
          });
        }

        // Apply rate limiting if configured
        if (keyData.rateLimit) {
          const rateLimiter = this.getOrCreateRateLimiter(keyData.id, keyData.rateLimit);
          if (rateLimiter) {
            return rateLimiter(req, res, async () => {
              await this.updateUsageAndContinue(req, res, next, keyData, startTime);
            });
          }
        }
        
        // Update usage and continue
        await this.updateUsageAndContinue(req, res, next, keyData, startTime);
        
      } catch (error) {
        console.error('API key validation error:', error);
        return res.status(500).json({
          error: {
            message: 'Internal server error during authentication',
            type: 'server_error',
            code: 'authentication_error'
          }
        });
      }
    };
  }

  // Check if API key has required permissions
  checkPermissions(req, permissions) {
    try {
      const endpoint = req.path;
      const method = req.method.toLowerCase();
      
      // Map endpoints to required permissions
      const permissionMap = {
        '/v1/chat/completions': ['chat.completions', 'chat.completions.create'],
        '/v1/models': ['models.list', 'models.read']
      };
      
      // Get required permissions for this endpoint
      const requiredPerms = permissionMap[endpoint] || [];
      
      // Check if key has any of the required permissions
      if (requiredPerms.length === 0) {
        return true; // No specific permissions required
      }
      
      // Special case: full access permission
      if (permissions.includes('*') || permissions.includes('full_access')) {
        return true;
      }
      
      // Check if key has any of the required permissions
      return requiredPerms.some(perm => permissions.includes(perm));
      
    } catch (error) {
      console.error('Permission check error:', error);
      return false; // Deny on error
    }
  }

  // Get or create rate limiter for API key
  getOrCreateRateLimiter(keyId, rateConfig) {
    try {
      if (!this.keyRateLimiters.has(keyId)) {
        const limiter = this.createKeyRateLimit(rateConfig);
        if (limiter) {
          this.keyRateLimiters.set(keyId, limiter);
        }
      }
      return this.keyRateLimiters.get(keyId);
    } catch (error) {
      console.error('Rate limiter creation error:', error);
      return null;
    }
  }

  // Update usage statistics and continue
  async updateUsageAndContinue(req, res, next, keyData, startTime) {
    try {
      // Track request start time for response time calculation
      req.requestStartTime = startTime;
      
      // Update last used timestamp
      await this.apiKeyManager.updateLastUsed(keyData.id);
      
      // Override res.end to capture response time and status
      const originalEnd = res.end;
      const self = this;
      res.end = async function(chunk, encoding) {
        const responseTime = Date.now() - startTime;
        const isError = res.statusCode >= 400;
        
        // Update usage statistics
        try {
          await self.apiKeyManager.updateUsageStats(keyData.id, responseTime, isError);
        } catch (statsError) {
          console.error('Error updating usage stats:', statsError);
        }
        
        // Call original end method
        originalEnd.call(this, chunk, encoding);
      };
      
      next();
    } catch (error) {
      console.error('Error updating API key usage:', error);
      // Continue anyway - don't block the request
      next();
    }
  }

  // Cleanup rate limiters for deleted keys
  cleanupRateLimiter(keyId) {
    this.keyRateLimiters.delete(keyId);
  }

  // Get middleware for health checks (no auth required)
  allowHealthCheck() {
    return (req, res, next) => {
      if (req.path === '/health' || req.path === '/v1/health') {
        return next();
      }
      
      // Apply normal API key validation for other routes
      return this.validateApiKey()(req, res, next);
    };
  }
}

module.exports = { ApiKeyMiddleware };