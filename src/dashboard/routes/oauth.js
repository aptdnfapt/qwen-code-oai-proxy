// src/dashboard/routes/oauth.js
// Qwen OAuth flow handling routes

const express = require('express');
const router = express.Router();

class OAuthRoutes {
  constructor(qwenAuthManager) {
    this.qwenAuthManager = qwenAuthManager;
    this.setupRoutes();
  }

  setupRoutes() {
    // POST /api/accounts/initiate - Initiate OAuth flow for new account
    router.post('/initiate', async (req, res) => {
      try {
        // TODO: Implement OAuth initiation
        const { accountId } = req.body;
        const deviceFlow = await this.qwenAuthManager.initiateDeviceFlow();
        
        // Store device flow data temporarily for polling
        // TODO: Implement temporary storage for device codes
        
        res.json({
          success: true,
          deviceCode: deviceFlow.device_code,
          userCode: deviceFlow.user_code,
          verificationUri: deviceFlow.verification_uri,
          verificationUriComplete: deviceFlow.verification_uri_complete,
          expiresIn: deviceFlow.expires_in,
          interval: deviceFlow.interval
        });
      } catch (error) {
        console.error('Error initiating OAuth flow:', error);
        res.status(500).json({ error: 'Failed to initiate OAuth flow' });
      }
    });

    // GET /api/accounts/status/:deviceCode - Poll OAuth status
    router.get('/status/:deviceCode', async (req, res) => {
      try {
        // TODO: Implement OAuth polling
        const { deviceCode } = req.params;
        const { accountId } = req.query;
        
        const result = await this.qwenAuthManager.pollForToken(deviceCode, accountId);
        
        if (result.success) {
          res.json({
            success: true,
            message: 'Account authorized successfully',
            accountId: result.accountId
          });
        } else if (result.pending) {
          res.json({
            success: false,
            pending: true,
            message: 'Authorization pending'
          });
        } else {
          res.status(400).json({
            success: false,
            error: result.error || 'Authorization failed'
          });
        }
      } catch (error) {
        console.error('Error polling OAuth status:', error);
        res.status(500).json({ error: 'Failed to poll OAuth status' });
      }
    });
  }

  getRouter() {
    return router;
  }
}

module.exports = { OAuthRoutes };