// src/dashboard/routes/apikeys.js
// API key management routes

const express = require('express');
const { ValidationMiddleware } = require('../../security/validation.js');
const router = express.Router();

class ApiKeyRoutes {
  constructor(apiKeyManager, dashboardAuthMiddleware) {
    this.apiKeyManager = apiKeyManager;
    this.dashboardAuth = dashboardAuthMiddleware;
    this.setupRoutes();
  }

  setupRoutes() {
    // All API key routes require authentication
    router.use(this.dashboardAuth.requireAuth.bind(this.dashboardAuth));

    // GET /api/keys - List all API keys
    router.get('/', async (req, res) => {
      try {
        const keys = await this.apiKeyManager.listKeys();
        
        // Add usage summary to each key
        const keysWithUsage = await Promise.all(
          keys.map(async (key) => {
            try {
              const stats = await this.apiKeyManager.getKeyStats(key.id);
              return {
                ...key,
                usage: {
                  totalRequests: stats.totalRequests || 0,
                  requestsToday: this.getRequestsToday(stats.dailyUsage),
                  averageResponseTime: stats.averageResponseTime || 0,
                  errorRate: stats.totalRequests > 0 ? (stats.totalErrors / stats.totalRequests) * 100 : 0
                }
              };
            } catch (error) {
              console.error(`Error getting stats for key ${key.id}:`, error);
              return {
                ...key,
                usage: { totalRequests: 0, requestsToday: 0, averageResponseTime: 0, errorRate: 0 }
              };
            }
          })
        );

        res.json({
          success: true,
          keys: keysWithUsage,
          total: keysWithUsage.length,
          active: keysWithUsage.filter(key => key.status === 'active').length
        });
      } catch (error) {
        console.error('Error listing API keys:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to list API keys',
          type: 'server_error'
        });
      }
    });

    // POST /api/keys - Create new API key (with validation)
    router.post('/', 
      ValidationMiddleware.prototype.validate(ValidationMiddleware.schemas.createApiKey),
      async (req, res) => {
      try {
        // Use validated data from middleware (already sanitized and validated)
        const { name, description, permissions, rateLimit } = req.validated.body;
        
        const keyData = {
          name,
          description: description || '',
          permissions: permissions || ['chat.completions', 'models.list'],
          rateLimit: rateLimit ? {
            maxRequests: rateLimit,
            windowMs: 60000 // 1 minute window
          } : null
        };

        const newKey = await this.apiKeyManager.createKey(keyData);
        
        // Log key creation
        console.log(`API key created: ${newKey.name} (${newKey.id}) by ${req.session.user}`);

        res.json({
          success: true,
          message: 'API key created successfully',
          key: newKey // This includes the full API key (only shown once)
        });

      } catch (error) {
        console.error('Error creating API key:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to create API key',
          type: 'server_error'
        });
      }
    });

    // PUT /api/keys/:keyId - Update API key
    router.put('/:keyId', async (req, res) => {
      try {
        const { keyId } = req.params;
        const { name, description, permissions, rateLimit, status } = req.body;
        
        // Input validation
        const updates = {};
        
        if (name !== undefined) {
          if (!name || name.trim().length === 0) {
            return res.status(400).json({
              success: false,
              error: 'API key name cannot be empty',
              type: 'validation_error'
            });
          }
          if (name.length > 100) {
            return res.status(400).json({
              success: false,
              error: 'API key name must be less than 100 characters',
              type: 'validation_error'
            });
          }
          updates.name = name.trim();
        }

        if (description !== undefined) {
          updates.description = description || '';
        }

        if (permissions !== undefined) {
          const validPermissions = [
            'chat.completions', 'chat.completions.create', 'chat.completions.stream',
            'models.list', 'models.read', 'full_access', '*'
          ];
          const invalidPermissions = permissions.filter(perm => !validPermissions.includes(perm));
          
          if (invalidPermissions.length > 0) {
            return res.status(400).json({
              success: false,
              error: `Invalid permissions: ${invalidPermissions.join(', ')}`,
              type: 'validation_error'
            });
          }
          updates.permissions = permissions;
        }

        if (rateLimit !== undefined) {
          if (rateLimit && rateLimit.maxRequests) {
            if (rateLimit.maxRequests < 1 || rateLimit.maxRequests > 10000) {
              return res.status(400).json({
                success: false,
                error: 'Rate limit must be between 1 and 10000 requests',
                type: 'validation_error'
              });
            }
            updates.rateLimit = {
              maxRequests: rateLimit.maxRequests,
              windowMs: rateLimit.windowMs || 60000
            };
          } else {
            updates.rateLimit = null;
          }
        }

        if (status !== undefined) {
          const validStatuses = ['active', 'disabled', 'revoked'];
          if (!validStatuses.includes(status)) {
            return res.status(400).json({
              success: false,
              error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
              type: 'validation_error'
            });
          }
          updates.status = status;
        }

        const updatedKey = await this.apiKeyManager.updateKey(keyId, updates);
        
        // Log key update
        console.log(`API key updated: ${updatedKey.name} (${keyId}) by ${req.session.user}`);

        res.json({
          success: true,
          message: 'API key updated successfully',
          key: {
            id: updatedKey.id,
            name: updatedKey.name,
            description: updatedKey.description,
            permissions: updatedKey.permissions,
            rateLimit: updatedKey.rateLimit,
            status: updatedKey.status,
            updatedAt: updatedKey.updatedAt
          }
        });

      } catch (error) {
        if (error.message === 'API key not found') {
          return res.status(404).json({
            success: false,
            error: 'API key not found',
            type: 'not_found'
          });
        }
        
        console.error('Error updating API key:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update API key',
          type: 'server_error'
        });
      }
    });

    // DELETE /api/keys/:keyId - Delete API key (with validation)
    router.delete('/:keyId',
      ValidationMiddleware.prototype.validate(ValidationMiddleware.schemas.deleteApiKey),
      async (req, res) => {
      try {
        const { keyId } = req.validated.params;
        
        // Get key info before deletion for logging
        const keys = await this.apiKeyManager.listKeys();
        const keyToDelete = keys.find(key => key.id === keyId);
        
        if (!keyToDelete) {
          return res.status(404).json({
            success: false,
            error: 'API key not found',
            type: 'not_found'
          });
        }

        await this.apiKeyManager.deleteKey(keyId);
        
        // Log key deletion
        console.log(`API key deleted: ${keyToDelete.name} (${keyId}) by ${req.session.user}`);

        res.json({
          success: true,
          message: 'API key deleted successfully'
        });

      } catch (error) {
        if (error.message === 'API key not found') {
          return res.status(404).json({
            success: false,
            error: 'API key not found',
            type: 'not_found'
          });
        }
        
        console.error('Error deleting API key:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to delete API key',
          type: 'server_error'
        });
      }
    });

    // GET /api/keys/:keyId/stats - Get key usage statistics
    router.get('/:keyId/stats', async (req, res) => {
      try {
        const { keyId } = req.params;
        const { period = '30d' } = req.query;
        
        const stats = await this.apiKeyManager.getKeyStats(keyId);
        
        // Calculate additional metrics based on period
        const periodStats = this.calculatePeriodStats(stats.dailyUsage, period);
        
        res.json({
          success: true,
          keyId,
          period,
          stats: {
            ...stats,
            periodSummary: periodStats,
            healthScore: this.calculateHealthScore(stats)
          }
        });

      } catch (error) {
        console.error('Error getting key stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get key statistics',
          type: 'server_error'
        });
      }
    });

    // GET /api/keys/stats - Get API key system statistics (dashboard compatibility)
    router.get('/stats', async (req, res) => {
      try {
        const systemStats = await this.apiKeyManager.getSystemStats();
        
        res.json({
          success: true,
          stats: {
            total: systemStats.totalKeys,
            active: systemStats.activeKeys,
            requestsToday: systemStats.requestsToday,
            totalRequests: systemStats.totalRequests
          }
        });

      } catch (error) {
        console.error('Error getting API key stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get API key statistics',
          type: 'server_error'
        });
      }
    });

    // GET /api/keys/system/stats - Get overall system statistics
    router.get('/system/stats', async (req, res) => {
      try {
        const systemStats = await this.apiKeyManager.getSystemStats();
        
        res.json({
          success: true,
          systemStats: {
            ...systemStats,
            timestamp: new Date().toISOString()
          }
        });

      } catch (error) {
        console.error('Error getting system stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get system statistics',
          type: 'server_error'
        });
      }
    });
  }

  // Helper method to get today's requests from daily usage
  getRequestsToday(dailyUsage) {
    if (!dailyUsage || dailyUsage.length === 0) return 0;
    
    const today = new Date().toISOString().split('T')[0];
    const todayUsage = dailyUsage.find(day => day.date === today);
    return todayUsage ? todayUsage.requests : 0;
  }

  // Helper method to calculate period statistics
  calculatePeriodStats(dailyUsage, period) {
    if (!dailyUsage) return { totalRequests: 0, averageDaily: 0, peakDay: null };
    
    let days;
    switch (period) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      default: days = 30;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    const periodData = dailyUsage.filter(day => day.date >= cutoffDateStr);
    const totalRequests = periodData.reduce((sum, day) => sum + day.requests, 0);
    const averageDaily = periodData.length > 0 ? totalRequests / periodData.length : 0;
    
    const peakDay = periodData.reduce((peak, day) => 
      (!peak || day.requests > peak.requests) ? day : peak, null);
    
    return {
      totalRequests,
      averageDaily: Math.round(averageDaily * 100) / 100,
      peakDay: peakDay ? { date: peakDay.date, requests: peakDay.requests } : null,
      activeDays: periodData.filter(day => day.requests > 0).length
    };
  }

  // Helper method to calculate API key health score
  calculateHealthScore(stats) {
    if (!stats.totalRequests) return 100; // New key gets perfect score
    
    let score = 100;
    
    // Penalize high error rate
    const errorRate = (stats.totalErrors / stats.totalRequests) * 100;
    if (errorRate > 10) score -= Math.min(30, errorRate * 2);
    
    // Penalize slow response times
    if (stats.averageResponseTime > 2000) {
      score -= Math.min(20, (stats.averageResponseTime - 2000) / 100);
    }
    
    // Bonus for consistent usage
    if (stats.totalRequests > 100) score += 5;
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  getRouter() {
    return router;
  }
}

module.exports = { ApiKeyRoutes };