const express = require('express');
const cors = require('cors');
const config = require('./config.js');
const PORT = config.port;
const HOST = config.host;
const { QwenAPI } = require('./qwen/api.js');
const { QwenAuthManager } = require('./qwen/auth.js');
const { DebugLogger } = require('./utils/logger.js');
const { countTokens } = require('./utils/tokenCounter.js');
const { ErrorFormatter } = require('./utils/errorFormatter.js');
const { AccountRefreshScheduler } = require('./utils/accountRefreshScheduler.js');

const app = express();
// Increase body parser limits for large requests
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

// Initialize Qwen API client
const qwenAPI = new QwenAPI();
const authManager = new QwenAuthManager();
const debugLogger = new DebugLogger();
const accountRefreshScheduler = new AccountRefreshScheduler(qwenAPI);

// API Key middleware
const validateApiKey = (req, res, next) => {
  // If no API key is configured, skip validation
  if (!config.apiKey) {
    return next();
  }

  // Check for API key in header
  const apiKey = req.headers["x-api-key"] || req.headers["authorization"];

  // Handle both "Bearer <token>" and direct API key formats
  let cleanApiKey = null;
  if (apiKey && typeof apiKey === "string") {
    if (apiKey.startsWith("Bearer ")) {
      cleanApiKey = apiKey.substring(7).trim();
    } else {
      cleanApiKey = apiKey.trim();
    }
  }

  // Check if the provided API key matches any of the configured keys
  if (!cleanApiKey || !config.apiKey?.includes(cleanApiKey)) {
    console.error(
      "\x1b[31m%s\x1b[0m",
      "Unauthorized request - Invalid or missing API key",
    );
    return res.status(401).json({
      error: {
        message: "Invalid or missing API key",
        type: "authentication_error",
      },
    });
  }

  next();
};

// Main proxy server
class QwenOpenAIProxy {
  async handleChatCompletion(req, res) {
    try {
      // Count tokens in the request
      const tokenCount = countTokens(req.body.messages);
      
      // Display token count in terminal
      console.log('\x1b[34m%s\x1b[0m', `[>] New Chat completion request received with ${tokenCount} tokens`);
      
      // Check if streaming is requested by client
      const isStreaming = req.body.stream === true;
      
      if (isStreaming) {
        // Handle streaming response
        await this.handleStreamingChatCompletion(req, res);
      } else {
        // Handle regular response
        await this.handleRegularChatCompletion(req, res);
      }
    } catch (error) {
      // Check if it's a validation error
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/chat/completions', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error processing chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error processing chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // Handle other errors
      const apiError = ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }
  
  async handleRegularChatCompletion(req, res) {
    try {
      const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
      // Call Qwen API through our integrated client
      const response = await qwenAPI.chatCompletions({
        model: req.body.model || config.defaultModel,
        messages: req.body.messages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature || config.defaultTemperature,
        max_tokens: req.body.max_tokens || config.defaultMaxTokens,
        top_p: req.body.top_p || config.defaultTopP,
        top_k: req.body.top_k || config.defaultTopK,
        repetition_penalty: req.body.repetition_penalty || config.defaultRepetitionPenalty,
        reasoning: req.body.reasoning,
        accountId
      });
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, response);
      
      // Display token usage if available in response
      let tokenInfo = '';
      if (response && response.usage) {
        const { prompt_tokens, completion_tokens, total_tokens } = response.usage;
        tokenInfo = ` (Prompt: ${prompt_tokens}, Completion: ${completion_tokens}, Total: ${total_tokens} tokens)`;
      }
      
      res.json(response);
    } catch (error) {
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/chat/completions regular', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error in regular chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error in regular chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // Re-throw to be handled by the main handler
      throw error;
    }
  }
  
  async handleStreamingChatCompletion(req, res) {
    try {
      // Set streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
      
      // Call Qwen API streaming method
      const stream = await qwenAPI.streamChatCompletions({
        model: req.body.model || config.defaultModel,
        messages: req.body.messages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature || config.defaultTemperature,
        max_tokens: req.body.max_tokens || config.defaultMaxTokens,
        top_p: req.body.top_p || config.defaultTopP,
        top_k: req.body.top_k || config.defaultTopK,
        repetition_penalty: req.body.repetition_penalty || config.defaultRepetitionPenalty,
        reasoning: req.body.reasoning,
        accountId
      });
      
      // Log the API call (without response data since it's streaming)
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, { streaming: true });

      // Pipe the stream to the response
      stream.pipe(res);
      
      // Handle stream errors
      stream.on('error', (error) => {
        console.error('\x1b[31m%s\x1b[0m', `Error in streaming chat completion: ${error.message}`);
        if (!res.headersSent) {
          const apiError = ErrorFormatter.openAIApiError(error.message, 'streaming_error');
          res.status(apiError.status).json(apiError.body);
        }
        res.end();
      });
      
      // Handle client disconnect
      req.on('close', () => {
        stream.destroy();
      });
      
    } catch (error) {
      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/chat/completions', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/chat/completions streaming', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error in streaming chat completion request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error in streaming chat completion request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        if (!res.headersSent) {
          res.status(authError.status).json(authError.body);
          res.end();
        }
        return;
      }
      
      // For other errors in streaming context
      const apiError = ErrorFormatter.openAIApiError(error.message);
      if (!res.headersSent) {
        res.status(apiError.status).json(apiError.body);
        res.end();
      }
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
      // Check if it's a validation error
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }
      
      // Log the API call with error
      await debugLogger.logApiCall('/auth/poll', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/auth/poll', error, 'error');
      
      // Print error message in red
      console.error('\x1b[31m%s\x1b[0m', `Error polling for token: ${error.message}`);
      
      const apiError = ErrorFormatter.openAIApiError(error.message, 'authentication_error');
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleWebSearch(req, res) {
    try {
      // Validate request body
      const { query, page, rows } = req.body;
      
      if (!query || typeof query !== 'string') {
        const validationError = ErrorFormatter.openAIValidationError('Query parameter is required and must be a string');
        return res.status(validationError.status).json(validationError.body);
      }

      if (page && (typeof page !== 'number' || page < 1)) {
        const validationError = ErrorFormatter.openAIValidationError('Page must be a positive integer');
        return res.status(validationError.status).json(validationError.body);
      }

      if (rows && (typeof rows !== 'number' || rows < 1 || rows > 100)) {
        const validationError = ErrorFormatter.openAIValidationError('Rows must be a number between 1 and 100');
        return res.status(validationError.status).json(validationError.body);
      }

      // Display search query in terminal
      console.log('\x1b[36m%s\x1b[0m', `[Web Search] Query: "${query}" (Page: ${page || 1}, Rows: ${rows || 10})`);
      
      // Get account from header, query, or body
      const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
      
      // Call Qwen Web Search API
      const response = await qwenAPI.webSearch({
        query: query,
        page: page || 1,
        rows: rows || 10,
        accountId
      });
      
      // Log the API call
      const debugFileName = await debugLogger.logApiCall('/v1/web/search', req, response);
      
      // Display search results summary
      const resultCount = response.data?.total || 0;
      const returnedCount = response.data?.docs?.length || 0;
      
      // Print success message with debug file info in green
      if (debugFileName) {
        console.log('\x1b[32m%s\x1b[0m', `Web search completed successfully. Found ${resultCount} results, returned ${returnedCount}. Debug log saved to: ${debugFileName}`);
      } else {
        console.log('\x1b[32m%s\x1b[0m', `Web search completed successfully. Found ${resultCount} results, returned ${returnedCount}.`);
      }
      
      res.json(response);
    } catch (error) {
      // Check if it's a validation error
      if (error.message.includes('Validation error')) {
        console.error('\x1b[31m%s\x1b[0m', `Validation error: ${error.message}`);
        const validationError = ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      // Log the API call with error
      const debugFileName = await debugLogger.logApiCall('/v1/web/search', req, null, error);
      
      // Also log detailed error separately
      await debugLogger.logError('/v1/web/search', error, 'error');
      
      // Print error message in red
      if (debugFileName) {
        console.error('\x1b[31m%s\x1b[0m', `Error processing web search request. Debug log saved to: ${debugFileName}`);
      } else {
        console.error('\x1b[31m%s\x1b[0m', 'Error processing web search request.');
      }
      
      // Handle authentication errors
      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }
      
      // Handle quota exceeded errors
      if (error.message.includes('quota') || error.message.includes('exceeded')) {
        const quotaError = {
          error: {
            message: "Web search quota exceeded. Free accounts have 2000 requests per day.",
            type: "quota_exceeded",
            code: "quota_exceeded"
          }
        };
        return res.status(429).json(quotaError);
      }
      
      // Handle other errors
      const apiError = ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }
}

// Initialize proxy
const proxy = new QwenOpenAIProxy();

// Apply API key middleware to all routes (including health check to protect account information)
app.use("/v1/", validateApiKey);
app.use("/auth/", validateApiKey);

// Routes
app.post('/v1/chat/completions', (req, res) => proxy.handleChatCompletion(req, res));
app.post('/v1/web/search', (req, res) => proxy.handleWebSearch(req, res));
app.get('/v1/models', (req, res) => proxy.handleModels(req, res));

// Authentication routes
app.post('/auth/initiate', (req, res) => proxy.handleAuthInitiate(req, res));
app.post('/auth/poll', (req, res) => proxy.handleAuthPoll(req, res));

// MCP endpoints
const { mcpGetHandler, mcpPostHandler } = require('./mcp.js');
app.get('/mcp', mcpGetHandler);
app.post('/mcp', mcpPostHandler);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const defaultCredentials = await qwenAPI.authManager.loadCredentials();
    const accountIds = qwenAPI.authManager.getAccountIds();
    const healthyAccounts = qwenAPI.getHealthyAccounts(accountIds);
    const failedAccounts = healthyAccounts.length === 0 ?
      new Set(accountIds) : new Set(accountIds.filter(id => !healthyAccounts.includes(id)));

    const accounts = [];
    let totalRequestsToday = 0;

    if (defaultCredentials) {
      const minutesLeft = (defaultCredentials.expiry_date - Date.now()) / 60000;
      const status = minutesLeft < 0 ? 'expired' : 'healthy';
      const expiresIn = Math.max(0, minutesLeft);
      const requestCount = qwenAPI.getRequestCount('default');
      const webSearchCount = qwenAPI.getWebSearchRequestCount('default');
      totalRequestsToday += requestCount;

      accounts.push({
        id: 'default',
        status,
        expiresIn: expiresIn ? `${expiresIn.toFixed(1)} minutes` : null,
        requestCount: requestCount,
        webSearchCount: webSearchCount,
        authErrorCount: qwenAPI.getAuthErrorCount('default')
      });
    }

    for (const accountId of accountIds) {
      const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
      let status = 'unknown';
      let expiresIn = null;

      if (credentials) {
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
        if (failedAccounts.has(accountId)) {
          status = 'failed';
        } else if (minutesLeft < 0) {
          status = 'expired';
        } else if (minutesLeft < 30) {
          status = 'expiring_soon';
        } else {
          status = 'healthy';
        }
        expiresIn = Math.max(0, minutesLeft);
      }

      const requestCount = qwenAPI.getRequestCount(accountId);
      const webSearchCount = qwenAPI.getWebSearchRequestCount(accountId);
      totalRequestsToday += requestCount;

      accounts.push({
        id: accountId.substring(0, 5),
        status,
        expiresIn: expiresIn ? `${expiresIn.toFixed(1)} minutes` : null,
        requestCount: requestCount,
        webSearchCount: webSearchCount,
        authErrorCount: qwenAPI.getAuthErrorCount(accountId)
      });
    }

    const healthyCount = accounts.filter(a => a.status === 'healthy').length;
    const failedCount = accounts.filter(a => a.status === 'failed').length;
    const expiringSoonCount = accounts.filter(a => a.status === 'expiring_soon').length;
    const expiredCount = accounts.filter(a => a.status === 'expired').length;

    // Get token usage data
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const today = new Date().toISOString().split('T')[0];
    for (const [accountId, usageData] of qwenAPI.tokenUsage.entries()) {
      const todayUsage = usageData.find(entry => entry.date === today);
      if (todayUsage) {
        totalInputTokens += todayUsage.inputTokens;
        totalOutputTokens += todayUsage.outputTokens;
      }
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      summary: {
        total: accounts.length,
        healthy: healthyCount,
        failed: failedCount,
        expiring_soon: expiringSoonCount,
        expired: expiredCount,
        total_requests_today: totalRequestsToday,
        lastReset: qwenAPI.lastFailedReset
      },
      token_usage: {
        input_tokens_today: totalInputTokens,
        output_tokens_today: totalOutputTokens,
        total_tokens_today: totalInputTokens + totalOutputTokens
      },
      accounts,
      server_info: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      endpoints: {
        openai: `${req.protocol}://${req.get('host')}/v1`,
        health: `${req.protocol}://${req.get('host')}/health`
      }
    });
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
      server_info: {
        uptime: process.uptime(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    });
  }
});

// Handle graceful shutdown to save pending data
process.on('SIGINT', async () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Received SIGINT, shutting down gracefully...');
  try {
    // Stop the account refresh scheduler
    accountRefreshScheduler.stopScheduler();
    console.log('\x1b[32m%s\x1b[0m', 'Account refresh scheduler stopped');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to stop account refresh scheduler:', error.message);
  }

  try {
    // Force save any pending request counts before exit
    await qwenAPI.saveRequestCounts();
    console.log('\x1b[32m%s\x1b[0m', 'Request counts saved successfully');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to save request counts on shutdown:', error.message);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\x1b[33m%s\x1b[0m', 'Received SIGTERM, shutting down gracefully...');
  try {
    // Stop the account refresh scheduler
    accountRefreshScheduler.stopScheduler();
    console.log('\x1b[32m%s\x1b[0m', 'Account refresh scheduler stopped');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to stop account refresh scheduler:', error.message);
  }

  try {
    // Force save any pending request counts before exit
    await qwenAPI.saveRequestCounts();
    console.log('\x1b[32m%s\x1b[0m', 'Request counts saved successfully');
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Failed to save request counts on shutdown:', error.message);
  }
  process.exit(0);
});

app.listen(PORT, HOST, async () => {
  console.log(`Qwen OpenAI Proxy listening on http://${HOST}:${PORT}`);
  console.log(`OpenAI-compatible endpoint: http://${HOST}:${PORT}/v1`);
  console.log(`Web search endpoint: http://${HOST}:${PORT}/v1/web/search`);
  console.log(`MCP endpoint: http://${HOST}:${PORT}/mcp`);
  console.log(`Authentication endpoint: http://${HOST}:${PORT}/auth/initiate`);

  // Init auth manager with Qwen API reference
  qwenAPI.authManager.init(qwenAPI);
  
  // Show available accounts
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const accountIds = qwenAPI.authManager.getAccountIds();
    
    // Show default account if configured
    const defaultAccount = config.defaultAccount;
    if (defaultAccount) {
      console.log(`\n\x1b[36mDefault account configured: ${defaultAccount}\x1b[0m`);
    }
    
    if (accountIds.length > 0) {
      console.log('\n\x1b[36mAvailable accounts:\x1b[0m');
      for (const accountId of accountIds) {
        const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
        const isValid = credentials && qwenAPI.authManager.isTokenValid(credentials);
        const isDefault = accountId === defaultAccount ? ' (default)' : '';
        console.log(`  ${accountId}${isDefault}: ${isValid ? '✅ Valid' : '❌ Invalid/Expired'}`);
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

  // Initialize the account refresh scheduler
  try {
    await accountRefreshScheduler.initialize();
  } catch (error) {
    console.log(`\n\x1b[31mFailed to initialize account refresh scheduler: ${error.message}\x1b[0m`);
  }
});