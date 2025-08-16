const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const config = require('./config.js');
const { QwenAPI } = require('./qwen/api.js');
const { QwenAuthManager } = require('./qwen/auth.js');
const { DebugLogger } = require('./utils/logger.js');
const { countTokens } = require('./utils/tokenCounter.js');

const app = express();
// Increase body parser limits for large requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

// Session configuration for dashboard
app.use(session({
  secret: process.env.DASHBOARD_SESSION_SECRET || 'your-session-secret-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: parseInt(process.env.DASHBOARD_SESSION_TIMEOUT) || 1800000 // 30 minutes
  }
}));

// Initialize Qwen API client
const qwenAPI = new QwenAPI();
const authManager = new QwenAuthManager();
const debugLogger = new DebugLogger();

// Main proxy server
class QwenOpenAIProxy {
  async handleChatCompletion(req, res) {
    try {
      // Count tokens in the request
      const tokenCount = countTokens(req.body.messages);
      
      // Display token count in terminal
      console.log('\x1b[36m%s\x1b[0m', `Chat completion request received with ${tokenCount} tokens`);
      
      // Check if streaming is requested and enabled
      const isStreaming = req.body.stream === true && config.stream;
      
      if (isStreaming) {
        // Handle streaming response
        await this.handleStreamingChatCompletion(req, res);
      } else {
        // Handle regular response
        // If client requested streaming but it's disabled, we still use regular completion
        await this.handleRegularChatCompletion(req, res);
      }
    } catch (error) {
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error processing chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error processing chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        return res.status(401).json({
          error: {
            message: 'Not authenticated with Qwen. Please authenticate first.',
            type: 'authentication_error'
          }
        });
      }
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'internal_server_error'
        }
      });
    }
  }
  
  async handleRegularChatCompletion(req, res) {
    try {
      // Call Qwen API through our integrated client
      const response = await qwenAPI.chatCompletions({
        model: req.body.model || config.defaultModel,
        messages: req.body.messages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature,
        max_tokens: req.body.max_tokens,
        top_p: req.body.top_p,
      });
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, response);
      
      // Display token usage if available in response
      let tokenInfo = '';
      if (response && response.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
        tokenInfo = ` (Prompt: ${prompt_tokens}, Completion: ${completion_tokens}, Total: ${total_tokens} tokens)`;
      }
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Chat completion request processed successfully${tokenInfo}. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', `Chat completion request processed successfully${tokenInfo}.`);
      }
      
      res.json(response);
    } catch (error) {
      throw error; // Re-throw to be handled by the main handler
    }
  }
  
  async handleStreamingChatCompletion(req, res) {
    try {
      // Set streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Call Qwen API streaming method
      const stream = await qwenAPI.streamChatCompletions({
        model: req.body.model || config.defaultModel,
        messages: req.body.messages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature,
        max_tokens: req.body.max_tokens,
        top_p: req.body.top_p,
      });
      
      // Log the API call (without response data since it's streaming)
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, { streaming: true });
      
      // Print streaming request message
      console.log('\x1b[32m%s\x1b[0m', `Streaming chat completion request started. Debug log saved to: ${debugFileName}`);
      
      // Pipe the stream to the response
      stream.pipe(res);
      
      // Handle stream errors
      stream.on('error', (error) => {
        console.error('\x1b[31m%s\x1b[0m', `Error in streaming chat completion: ${error.message}`);
        if (!res.headersSent) {
          res.status(500).json({
            error: {
              message: error.message,
              type: 'streaming_error'
            }
          });
        }
        res.end();
      });
      
      // Handle client disconnect
      req.on('close', () => {
        stream.destroy();
      });
      
    } catch (error) {
      throw error; // Re-throw to be handled by the main handler
    }
  }
  
  async handleModels(req, res) {
    try {
      // Display request in terminal
      console.log('\x1b[36m%s\x1b[0m', 'Models request received');
      
      // Get models from Qwen
      const models = await qwenAPI.listModels();
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/v1/models', req, models);
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Models request processed successfully. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', 'Models request processed successfully.');
      }
      
      res.json(models);
    } catch (error) {
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/models', req, null, error);
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error fetching models. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error fetching models.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        return res.status(401).json({
          error: {
            message: 'Not authenticated with Qwen. Please authenticate first.',
            type: 'authentication_error'
          }
        });
      }
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'internal_server_error'
        }
      });
    }
  }
  
  
  
  async handleAuthInitiate(req, res) {
    try {
      // Initiate device flow
      const deviceFlow = await authManager.initiateDeviceFlow();
      
      const response = {
        verification_uri: deviceFlow.verification_uri,
        user_code: deviceFlow.user_code,
        device_code: deviceFlow.device_code,
        code_verifier: deviceFlow.code_verifier // This should be stored securely for polling
      };
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/auth/initiate', req, response);
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Auth initiate request processed successfully. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', 'Auth initiate request processed successfully.');
      }
      
      res.json(response);
    } catch (error) {
      // Log the API call with error
      await debugLogger.logApiCall('/auth/initiate', req, null, error);
      
      // Print error message in red
      console.error('\x1b[31m%s\x1b[0m', `Error initiating authentication: ${error.message}`);
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'authentication_error'
        }
      });
    }
  }
  
  async handleAuthPoll(req, res) {
    try {
      const { device_code, code_verifier } = req.body;
      
      if (!device_code || !code_verifier) {
        const errorResponse = {
          error: {
            message: 'Missing device_code or code_verifier',
            type: 'invalid_request'
          }
        };
        
        // Log the API call with error
        await debugLogger.logApiCall('/auth/poll', req, null, new Error('Missing device_code or code_verifier'));
        
        // Print error message in red
        console.error('\x1b[31m%s\x1b[0m', 'Error in auth poll: Missing device_code or code_verifier');
        
        return res.status(400).json(errorResponse);
      }
      
      // Poll for token
      const token = await authManager.pollForToken(device_code, code_verifier);
      
      const response = {
        access_token: token,
        message: 'Authentication successful'
      };
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/auth/poll', req, response);
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Auth poll request processed successfully. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', 'Auth poll request processed successfully.');
      }
      
      res.json(response);
    } catch (error) {
      // Log the API call with error
      await debugLogger.logApiCall('/auth/poll', req, null, error);
      
      // Print error message in red
      console.error('\x1b[31m%s\x1b[0m', `Error polling for token: ${error.message}`);
      
      res.status(500).json({
        error: {
          message: error.message,
          type: 'authentication_error'
        }
      });
    }
  }
}

// Initialize proxy
const proxy = new QwenOpenAIProxy();

// Routes
app.post('/v1/chat/completions', (req, res) => proxy.handleChatCompletion(req, res));
app.get('/v1/models', (req, res) => proxy.handleModels(req, res));

// Authentication routes
app.post('/auth/initiate', (req, res) => proxy.handleAuthInitiate(req, res));
app.post('/auth/poll', (req, res) => proxy.handleAuthPoll(req, res));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Dashboard static files
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard/public')));

// Dashboard route - serve the main dashboard page
app.get('/dashboard/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/public/index.html'));
});

app.get('/dashboard', (req, res) => {
  res.redirect('/dashboard/');
});

// Dashboard login page
app.get('/dashboard/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/public/login.html'));
});

// Dashboard setup page
app.get('/dashboard/setup', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard/public/setup.html'));
});

// Dashboard API Routes
// POST /api/auth/login - Dashboard login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Get credentials from environment variables
    const validUser = process.env.DASHBOARD_USER || 'admin';
    const validPassword = process.env.DASHBOARD_PASSWORD || 'admin123';
    
    if (username === validUser && password === validPassword) {
      // Create session
      req.session.authenticated = true;
      req.session.user = username;
      req.session.loginTime = new Date();
      req.session.lastActivity = new Date();
      
      console.log(`Successful dashboard login for user: ${username} from IP: ${req.ip}`);
      
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          username: username,
          loginTime: req.session.loginTime
        }
      });
    } else {
      console.warn(`Failed dashboard login attempt for user: ${username} from IP: ${req.ip}`);
      
      res.status(401).json({
        success: false,
        error: 'Invalid username or password',
        type: 'authentication_error'
      });
    }
  } catch (error) {
    console.error('Dashboard login error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during login',
      type: 'server_error'
    });
  }
});

// POST /api/auth/logout - Dashboard logout
app.post('/api/auth/logout', (req, res) => {
  try {
    const username = req.session?.user;
    
    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).json({
          success: false,
          error: 'Logout failed',
          type: 'server_error'
        });
      }
      
      if (username) {
        console.log(`User ${username} logged out from IP: ${req.ip}`);
      }
      
      res.json({
        success: true,
        message: 'Logout successful'
      });
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
app.get('/api/auth/verify', (req, res) => {
  try {
    if (req.session && req.session.authenticated && req.session.user) {
      // Update last activity
      req.session.lastActivity = new Date();
      
      res.json({
        success: true,
        authenticated: true,
        user: {
          username: req.session.user,
          loginTime: req.session.loginTime,
          lastActivity: req.session.lastActivity
        }
      });
    } else {
      res.json({
        success: true,
        authenticated: false,
        message: 'Not authenticated'
      });
    }
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Verification failed',
      type: 'server_error'
    });
  }
});

// Dashboard API Keys Management
app.get('/api/keys', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    // Mock API keys data - In production, this would come from a database
    res.json({
      success: true,
      keys: [
        {
          id: 'sk-1',
          name: 'Default Key',
          key: 'sk-proj-...abcd',
          created: new Date().toISOString(),
          lastUsed: new Date().toISOString(),
          requests: 42,
          status: 'active'
        }
      ]
    });
  } catch (error) {
    console.error('Error loading API keys:', error);
    res.status(500).json({ success: false, error: 'Failed to load API keys' });
  }
});

app.post('/api/keys', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { name } = req.body;
    const newKey = {
      id: 'sk-' + Math.random().toString(36).substring(7),
      name: name || 'New API Key',
      key: 'sk-proj-' + Math.random().toString(36).substring(2, 15),
      created: new Date().toISOString(),
      lastUsed: null,
      requests: 0,
      status: 'active'
    };
    
    res.json({
      success: true,
      message: 'API key created successfully',
      key: newKey
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ success: false, error: 'Failed to create API key' });
  }
});

app.delete('/api/keys/:keyId', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { keyId } = req.params;
    
    res.json({
      success: true,
      message: `API key ${keyId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ success: false, error: 'Failed to delete API key' });
  }
});

app.get('/api/keys/stats', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    res.json({
      success: true,
      stats: {
        totalKeys: 1,
        activeKeys: 1,
        totalRequests: 42,
        todayRequests: 5
      }
    });
  } catch (error) {
    console.error('Error loading API key stats:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

// Dashboard Accounts Management
app.get('/api/accounts', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    // Mock accounts data - In production, this would come from the QwenAuthManager
    res.json({
      success: true,
      accounts: [
        {
          id: 'default',
          name: 'Default Account',
          status: 'active',
          requests: 25,
          dailyLimit: 1000,
          lastUsed: new Date().toISOString()
        }
      ]
    });
  } catch (error) {
    console.error('Error loading accounts:', error);
    res.status(500).json({ success: false, error: 'Failed to load accounts' });
  }
});

app.post('/api/accounts/initiate', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const deviceCode = 'device_' + Math.random().toString(36).substring(7);
    const userCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    res.json({
      success: true,
      deviceCode: deviceCode,
      userCode: userCode,
      verificationUri: 'https://oauth.qwen.ai/device',
      message: 'Please visit the verification URI and enter the user code'
    });
  } catch (error) {
    console.error('Error initiating OAuth:', error);
    res.status(500).json({ success: false, error: 'Failed to initiate OAuth' });
  }
});

app.get('/api/accounts/status/:deviceCode', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    // Mock status - In production, this would poll the actual OAuth status
    res.json({
      success: true,
      status: 'pending',
      message: 'Waiting for user authorization'
    });
  } catch (error) {
    console.error('Error checking OAuth status:', error);
    res.status(500).json({ success: false, error: 'Failed to check status' });
  }
});

app.delete('/api/accounts/:accountId', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    const { accountId } = req.params;
    
    res.json({
      success: true,
      message: `Account ${accountId} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

app.get('/api/accounts/stats', (req, res) => {
  try {
    if (!req.session?.authenticated) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
    res.json({
      success: true,
      stats: {
        totalAccounts: 1,
        activeAccounts: 1,
        totalRequests: 25,
        averageResponseTime: 245
      }
    });
  } catch (error) {
    console.error('Error loading account stats:', error);
    res.status(500).json({ success: false, error: 'Failed to load stats' });
  }
});

const PORT = config.port;
const HOST = config.host;

app.listen(PORT, HOST, async () => {
  console.log(`Qwen OpenAI Proxy listening on http://${HOST}:${PORT}`);
  console.log(`OpenAI-compatible endpoint: http://${HOST}:${PORT}/v1`);
  console.log(`Authentication endpoint: http://${HOST}:${PORT}/auth/initiate`);
  
  // Show available accounts
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const accountIds = qwenAPI.authManager.getAccountIds();
    
    if (accountIds.length > 0) {
      console.log('\n\x1b[36mAvailable accounts:\x1b[0m');
      for (const accountId of accountIds) {
        const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
        const isValid = credentials && qwenAPI.authManager.isTokenValid(credentials);
        console.log(`  ${accountId}: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}`);
      }
      console.log('\n\x1b[33mNote: Try using the proxy to make sure accounts are not invalid\x1b[0m');
    } else {
      // Check if default account exists
      const defaultCredentials = await qwenAPI.authManager.loadCredentials();
      if (defaultCredentials) {
        const isValid = qwenAPI.authManager.isTokenValid(defaultCredentials);
        console.log(`\n\x1b[36mDefault account: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}\x1b[0m`);
        console.log('\n\x1b[33mNote: Try using the proxy to make sure the account is not invalid\x1b[0m');
      } else {
        console.log('\n\x1b[36mNo accounts configured. Please authenticate first.\x1b[0m');
      }
    }
  } catch (error) {
    console.log('\n\x1b[33mWarning: Could not load account information\x1b[0m');
  }
});