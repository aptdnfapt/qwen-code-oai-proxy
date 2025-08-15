// src/dashboard/routes/accounts.js
// Qwen account management routes

const express = require('express');
const { ValidationMiddleware } = require('../../security/validation.js');
const router = express.Router();

class AccountRoutes {
  constructor(qwenAuthManager, dashboardAuthMiddleware) {
    this.qwenAuthManager = qwenAuthManager;
    this.dashboardAuth = dashboardAuthMiddleware;
    this.activeDeviceFlows = new Map(); // Store active OAuth flows
    this.setupRoutes();
  }

  setupRoutes() {
    // All account routes require authentication
    router.use(this.dashboardAuth.requireAuth.bind(this.dashboardAuth));

    // GET /api/accounts - List all Qwen accounts with detailed status
    router.get('/', async (req, res) => {
      try {
        await this.qwenAuthManager.loadAllAccounts();
        const accountIds = await this.qwenAuthManager.getAccountIds();
        const accounts = [];
        
        for (const accountId of accountIds) {
          try {
            const credentials = await this.qwenAuthManager.getAccountCredentials(accountId);
            const isValid = await this.qwenAuthManager.isAccountValid(accountId);
            
            // Calculate token expiry info
            let tokenInfo = {};
            if (credentials && credentials.access_token) {
              const expiresAt = new Date(credentials.expires_at || 0);
              const now = new Date();
              const isExpired = expiresAt <= now;
              const timeUntilExpiry = isExpired ? 0 : Math.max(0, expiresAt - now);
              
              tokenInfo = {
                expiresAt: credentials.expires_at,
                isExpired,
                timeUntilExpiry: Math.floor(timeUntilExpiry / 1000), // seconds
                hasRefreshToken: !!credentials.refresh_token
              };
            }
            
            accounts.push({
              id: accountId,
              status: isValid ? 'active' : 'expired',
              tokenInfo,
              // TODO: Integrate with actual usage tracking when implemented
              usage: {
                requestsToday: 0,
                quotaLimit: 2000,
                quotaUsed: 0,
                quotaRemaining: 2000
              },
              lastUsed: null, // TODO: Track last usage
              addedAt: credentials?.created_at || null
            });
          } catch (error) {
            console.error(`Error processing account ${accountId}:`, error);
            accounts.push({
              id: accountId,
              status: 'error',
              error: 'Failed to load account details',
              usage: { requestsToday: 0, quotaLimit: 2000, quotaUsed: 0, quotaRemaining: 2000 }
            });
          }
        }
        
        // Sort accounts by status (active first) and then by ID
        accounts.sort((a, b) => {
          if (a.status !== b.status) {
            if (a.status === 'active') return -1;
            if (b.status === 'active') return 1;
            if (a.status === 'expired') return -1;
            if (b.status === 'expired') return 1;
          }
          return a.id.localeCompare(b.id);
        });
        
        res.json({
          success: true,
          accounts,
          summary: {
            total: accounts.length,
            active: accounts.filter(acc => acc.status === 'active').length,
            expired: accounts.filter(acc => acc.status === 'expired').length,
            error: accounts.filter(acc => acc.status === 'error').length
          }
        });
      } catch (error) {
        console.error('Error listing accounts:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to list accounts',
          type: 'server_error'
        });
      }
    });

    // POST /api/accounts/initiate - Initiate OAuth flow for new account (with validation)
    router.post('/initiate',
      ValidationMiddleware.prototype.validate(ValidationMiddleware.schemas.createAccount),
      async (req, res) => {
      try {
        // Use validated data from middleware (already sanitized and validated)
        const { accountId } = req.validated.body;
        
        // Check if account already exists
        const existingAccountIds = await this.qwenAuthManager.getAccountIds();
        if (existingAccountIds.includes(accountId)) {
          return res.status(409).json({
            success: false,
            error: 'Account with this ID already exists',
            type: 'conflict_error'
          });
        }

        // Initiate device flow
        const deviceFlow = await this.qwenAuthManager.initiateDeviceFlow();
        
        // Store device flow data for polling
        const flowData = {
          accountId: accountId,
          deviceCode: deviceFlow.device_code,
          userCode: deviceFlow.user_code,
          verificationUri: deviceFlow.verification_uri,
          verificationUriComplete: deviceFlow.verification_uri_complete,
          expiresIn: deviceFlow.expires_in,
          interval: deviceFlow.interval,
          createdAt: new Date(),
          createdBy: req.session.user
        };
        
        this.activeDeviceFlows.set(deviceFlow.device_code, flowData);
        
        // Clean up expired flows (older than 15 minutes)
        this.cleanupExpiredFlows();
        
        // Log OAuth initiation
        console.log(`OAuth flow initiated for account: ${accountId} by ${req.session.user}`);
        
        res.json({
          success: true,
          message: 'OAuth flow initiated successfully',
          flow: {
            deviceCode: deviceFlow.device_code,
            userCode: deviceFlow.user_code,
            verificationUri: deviceFlow.verification_uri,
            verificationUriComplete: deviceFlow.verification_uri_complete,
            expiresIn: deviceFlow.expires_in,
            interval: deviceFlow.interval,
            accountId: accountId
          }
        });

      } catch (error) {
        console.error('Error initiating OAuth flow:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to initiate OAuth flow',
          type: 'server_error'
        });
      }
    });

    // GET /api/accounts/status/:deviceCode - Poll OAuth authorization status
    router.get('/status/:deviceCode', async (req, res) => {
      try {
        const { deviceCode } = req.params;
        
        // Get flow data
        const flowData = this.activeDeviceFlows.get(deviceCode);
        if (!flowData) {
          return res.status(404).json({
            success: false,
            error: 'Device code not found or expired',
            type: 'not_found'
          });
        }

        // Check if flow has expired
        const now = new Date();
        const flowAge = (now - flowData.createdAt) / 1000; // seconds
        if (flowAge > flowData.expiresIn) {
          this.activeDeviceFlows.delete(deviceCode);
          return res.status(400).json({
            success: false,
            error: 'Device code has expired',
            type: 'expired'
          });
        }

        // Poll for token
        try {
          const result = await this.qwenAuthManager.pollForToken(deviceCode, flowData.accountId);
          
          if (result.success) {
            // OAuth completed successfully
            this.activeDeviceFlows.delete(deviceCode);
            
            // Log successful OAuth
            console.log(`OAuth completed successfully for account: ${flowData.accountId} by ${flowData.createdBy}`);
            
            res.json({
              success: true,
              status: 'completed',
              message: 'Account authorized successfully',
              accountId: flowData.accountId
            });
          } else if (result.pending) {
            // Still waiting for user authorization
            const remainingTime = Math.max(0, flowData.expiresIn - flowAge);
            
            res.json({
              success: true,
              status: 'pending',
              message: 'Authorization pending',
              remainingTime: Math.floor(remainingTime),
              userCode: flowData.userCode,
              verificationUri: flowData.verificationUriComplete
            });
          } else {
            // OAuth failed
            this.activeDeviceFlows.delete(deviceCode);
            
            console.warn(`OAuth failed for account: ${flowData.accountId} - ${result.error}`);
            
            res.status(400).json({
              success: false,
              status: 'failed',
              error: result.error || 'Authorization failed',
              type: 'oauth_error'
            });
          }
        } catch (pollError) {
          console.error('Error polling OAuth status:', pollError);
          res.status(500).json({
            success: false,
            error: 'Failed to check authorization status',
            type: 'server_error'
          });
        }

      } catch (error) {
        console.error('Error checking OAuth status:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to check OAuth status',
          type: 'server_error'
        });
      }
    });

    // DELETE /api/accounts/:accountId - Remove Qwen account
    router.delete('/:accountId', async (req, res) => {
      try {
        const { accountId } = req.params;
        
        // Check if account exists
        const existingAccountIds = await this.qwenAuthManager.getAccountIds();
        if (!existingAccountIds.includes(accountId)) {
          return res.status(404).json({
            success: false,
            error: 'Account not found',
            type: 'not_found'
          });
        }

        // Remove account
        await this.qwenAuthManager.removeAccount(accountId);
        
        // Log account removal
        console.log(`Qwen account removed: ${accountId} by ${req.session.user}`);
        
        res.json({
          success: true,
          message: 'Account removed successfully'
        });
      } catch (error) {
        console.error('Error removing account:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to remove account',
          type: 'server_error'
        });
      }
    });

    // GET /api/accounts/stats - Get overall account statistics
    router.get('/stats', async (req, res) => {
      try {
        await this.qwenAuthManager.loadAllAccounts();
        const accountIds = await this.qwenAuthManager.getAccountIds();
        const totalAccounts = accountIds.length;
        let activeAccounts = 0;
        let expiredAccounts = 0;
        let totalRequestsToday = 0; // TODO: Implement actual request counting
        
        for (const accountId of accountIds) {
          try {
            const isValid = await this.qwenAuthManager.isAccountValid(accountId);
            if (isValid) {
              activeAccounts++;
            } else {
              expiredAccounts++;
            }
            // TODO: Add actual request counting per account
          } catch (error) {
            console.error(`Error checking account ${accountId}:`, error);
            expiredAccounts++;
          }
        }
        
        const totalQuotaLimit = totalAccounts * 2000; // 2000 requests per account per day
        const quotaUtilization = totalQuotaLimit > 0 ? (totalRequestsToday / totalQuotaLimit) * 100 : 0;
        
        res.json({
          success: true,
          stats: {
            totalAccounts,
            activeAccounts,
            expiredAccounts,
            totalRequestsToday,
            totalQuotaLimit,
            quotaUtilization: Math.round(quotaUtilization * 100) / 100,
            averageRequestsPerAccount: activeAccounts > 0 ? Math.round(totalRequestsToday / activeAccounts) : 0
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error getting account stats:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get account statistics',
          type: 'server_error'
        });
      }
    });

    // GET /api/accounts/flows - Get active OAuth flows (for debugging)
    router.get('/flows', async (req, res) => {
      try {
        this.cleanupExpiredFlows();
        
        const flows = Array.from(this.activeDeviceFlows.values()).map(flow => ({
          accountId: flow.accountId,
          userCode: flow.userCode,
          expiresIn: flow.expiresIn,
          remainingTime: Math.max(0, flow.expiresIn - ((new Date() - flow.createdAt) / 1000)),
          createdAt: flow.createdAt,
          createdBy: flow.createdBy
        }));
        
        res.json({
          success: true,
          activeFlows: flows,
          total: flows.length
        });
      } catch (error) {
        console.error('Error getting OAuth flows:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get OAuth flows',
          type: 'server_error'
        });
      }
    });

    // DELETE /api/accounts/flows/:deviceCode - Cancel OAuth flow
    router.delete('/flows/:deviceCode', async (req, res) => {
      try {
        const { deviceCode } = req.params;
        
        const flowData = this.activeDeviceFlows.get(deviceCode);
        if (!flowData) {
          return res.status(404).json({
            success: false,
            error: 'OAuth flow not found',
            type: 'not_found'
          });
        }

        this.activeDeviceFlows.delete(deviceCode);
        
        console.log(`OAuth flow cancelled for account: ${flowData.accountId} by ${req.session.user}`);
        
        res.json({
          success: true,
          message: 'OAuth flow cancelled successfully'
        });
      } catch (error) {
        console.error('Error cancelling OAuth flow:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to cancel OAuth flow',
          type: 'server_error'
        });
      }
    });
  }

  // Clean up expired OAuth flows
  cleanupExpiredFlows() {
    const now = new Date();
    for (const [deviceCode, flowData] of this.activeDeviceFlows.entries()) {
      const flowAge = (now - flowData.createdAt) / 1000;
      if (flowAge > flowData.expiresIn) {
        this.activeDeviceFlows.delete(deviceCode);
        console.log(`Cleaned up expired OAuth flow for account: ${flowData.accountId}`);
      }
    }
  }

  getRouter() {
    return router;
  }
}

module.exports = { AccountRoutes };