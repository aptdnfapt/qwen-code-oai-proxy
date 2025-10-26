const axios = require('axios');
const http = require('http');
const https = require('https');
const { QwenAuthManager } = require('./auth.js');
const { PassThrough } = require('stream');
const path = require('path');
const { promises: fs } = require('fs');

// Create HTTP agents with connection pooling
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000
});

// Default Qwen configuration
const DEFAULT_QWEN_API_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-coder-plus';

// List of known Qwen models
const QWEN_MODELS = [
  {
    id: 'qwen3-coder-plus',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-coder-flash',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'vision-model',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  }
];

/**
 * Process messages to handle image content for vision models
 * @param {Array} messages - Array of messages
 * @param {string} model - Model name
 * @returns {Array} Processed messages
 */
function processMessagesForVision(messages, model) {
  // Only process for vision-model
  if (model !== 'vision-model') {
    return messages;
  }

  return messages.map(message => {
    if (!message.content) {
      return message;
    }

    // If content is already an array, assume it's properly formatted
    if (Array.isArray(message.content)) {
      return message;
    }

    // If content is a string, check if it contains image references
    if (typeof message.content === 'string') {
      // Look for base64 image patterns or URLs
      const imagePatterns = [
        /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g,
        /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|bmp)/gi
      ];

      let hasImages = false;
      const content = message.content;
      const parts = [{ type: 'text', text: content }];

      // Extract base64 images
      const base64Matches = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g);
      if (base64Matches) {
        hasImages = true;
        base64Matches.forEach(match => {
          const mimeMatch = match.match(/data:image\/([^;]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'png';
          const base64Data = match.split(',')[1];
          
          parts.push({
            type: 'image_url',
            image_url: {
              url: match
            }
          });
        });
      }

      // Extract image URLs
      const urlMatches = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|bmp)/gi);
      if (urlMatches) {
        hasImages = true;
        urlMatches.forEach(url => {
          parts.push({
            type: 'image_url',
            image_url: {
              url: url
            }
          });
        });
      }

      // If no images found, keep as string
      if (!hasImages) {
        return message;
      }

      return {
        ...message,
        content: parts
      };
    }

    return message;
  });
}

/**
 * Check if an error is related to authentication/authorization
 */
function isAuthError(error) {
  if (!error) return false;

  const errorMessage = 
    error instanceof Error 
      ? error.message.toLowerCase() 
      : String(error).toLowerCase();

  // Define a type for errors that might have status or code properties
  const errorWithCode = error;
  const errorCode = errorWithCode?.response?.status || errorWithCode?.code;

  return (
    errorCode === 400 ||
    errorCode === 401 ||
    errorCode === 403 ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('invalid api key') ||
    errorMessage.includes('invalid access token') ||
    errorMessage.includes('token expired') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('access denied') ||
    (errorMessage.includes('token') && errorMessage.includes('expired')) ||
    // Also check for 504 errors which might be related to auth issues
    errorCode === 504 ||
    errorMessage.includes('504') ||
    errorMessage.includes('gateway timeout')
  );
}

/**
 * Check if an error is related to quota limits
 */
function isQuotaExceededError(error) {
  if (!error) return false;

  const errorMessage = 
    error instanceof Error 
      ? error.message.toLowerCase() 
      : String(error).toLowerCase();

  // Define a type for errors that might have status or code properties
  const errorWithCode = error;
  const errorCode = errorWithCode?.response?.status || errorWithCode?.code;

  return (
    errorMessage.includes('insufficient_quota') ||
    errorMessage.includes('free allocated quota exceeded') ||
    (errorMessage.includes('quota') && errorMessage.includes('exceeded')) ||
    errorCode === 429
  );
}

class QwenAPI {
  constructor() {
    this.authManager = new QwenAuthManager();
    this.requestCount = new Map(); // Track requests per account
    this.authErrorCount = new Map(); // Track consecutive auth errors per account
    this.tokenUsage = new Map(); // Track token usage per account
    this.lastResetDate = new Date().toISOString().split('T')[0]; // Track last reset date (UTC)
    this.requestCountFile = path.join(this.authManager.qwenDir, 'request_counts.json');
    
    // Smart account selection
    this.failedAccountsFile = path.join(this.authManager.qwenDir, 'failed_accounts.json');
    this.failedAccounts = new Set();
    this.lastFailedReset = null;
    
    // File I/O caching mechanism
    this.lastSaveTime = 0;
    this.saveInterval = 60000; // Save every 60 seconds
    this.pendingSave = false;
    
    // Concurrent request handling
    this.accountLocks = new Map(); // Track which accounts are in use
    this.accountQueues = new Map(); // Queue for requests waiting for specific accounts
    
    // Rate limiting per account
    this.accountRequestCounts = new Map(); // Track requests per account per time window
    this.requestWindowDuration = 60000; // 1 minute window
    
    this.loadRequestCounts();
    this.loadFailedAccounts();
  }

  /**
   * Reset failed accounts if we've crossed into a new UTC day
   */
  async resetFailedAccountsIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastFailedReset !== today) {
      this.failedAccounts.clear();
      this.lastFailedReset = today;
      await this.saveFailedAccounts();
      console.log('Resetting failed accounts for new UTC day');
    }
  }

  /**
   * Load request counts from disk
   */
  async loadRequestCounts() {
    try {
      const data = await fs.readFile(this.requestCountFile, 'utf8');
      const counts = JSON.parse(data);
      
      // Restore last reset date
      if (counts.lastResetDate) {
        this.lastResetDate = counts.lastResetDate;
      }
      
      // Restore request counts
      if (counts.requests) {
        for (const [accountId, count] of Object.entries(counts.requests)) {
          this.requestCount.set(accountId, count);
        }
      }
      
      // Restore token usage data
      if (counts.tokenUsage) {
        for (const [accountId, usageData] of Object.entries(counts.tokenUsage)) {
          this.tokenUsage.set(accountId, usageData);
        }
      }
      
      // Reset counts if we've crossed into a new UTC day
      this.resetRequestCountsIfNeeded();
    } catch (error) {
      // File doesn't exist or is invalid, start with empty counts
      this.resetRequestCountsIfNeeded();
    }
  }

  /**
   * Save request counts to disk
   */
  async saveRequestCounts() {
    try {
      const counts = {
        lastResetDate: this.lastResetDate,
        requests: Object.fromEntries(this.requestCount),
        tokenUsage: Object.fromEntries(this.tokenUsage)
      };
      await fs.writeFile(this.requestCountFile, JSON.stringify(counts, null, 2));
      this.lastSaveTime = Date.now();
      this.pendingSave = false;
    } catch (error) {
      console.warn('Failed to save request counts:', error.message);
      this.pendingSave = false;
    }
  }

  /**
   * Schedule a save operation with debouncing
   */
  scheduleSave() {
    // Don't schedule if save is already pending
    if (this.pendingSave) return;
    
    this.pendingSave = true;
    const now = Date.now();
    
    // If saved recently, wait for interval, otherwise save immediately
    if (now - this.lastSaveTime < this.saveInterval) {
      setTimeout(() => this.saveRequestCounts(), this.saveInterval);
    } else {
      // Save immediately
      this.saveRequestCounts();
    }
  }

  /**
   * Reset request counts if we've crossed into a new UTC day
   */
  resetRequestCountsIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.requestCount.clear();
      this.lastResetDate = today;
      console.log('Request counts reset for new UTC day');
      this.saveRequestCounts();
    }
  }

  /**
   * Load failed accounts from local JSON file
   */
  async loadFailedAccounts() {
    try {
      const data = await fs.readFile(this.failedAccountsFile, 'utf8');
      const failed = JSON.parse(data);
      
      // Reset failed accounts if it's a new UTC day
      const today = new Date().toISOString().split('T')[0];
      if (failed.lastReset !== today) {
        console.log('Resetting failed accounts for new UTC day');
        this.failedAccounts.clear();
        this.lastFailedReset = today;
        await this.saveFailedAccounts();
      } else {
        this.failedAccounts = new Set(failed.accounts || []);
        this.lastFailedReset = failed.lastReset;
      }
    } catch (error) {
      // File doesn't exist or is invalid, start with empty failed accounts
      this.failedAccounts.clear();
      this.lastFailedReset = new Date().toISOString().split('T')[0];
      this.saveFailedAccounts();
    }
  }

  /**
   * Save failed accounts to local JSON file
   */
  async saveFailedAccounts() {
    try {
      const data = {
        accounts: Array.from(this.failedAccounts),
        lastReset: this.lastFailedReset
      };
      await fs.writeFile(this.failedAccountsFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save failed accounts:', error.message);
    }
  }

  /**
   * Mark an account as failed
   */
  async markAccountAsFailed(accountId) {
    if (!this.failedAccounts.has(accountId)) {
      this.failedAccounts.add(accountId);
      console.log(`Marked account ${accountId} as failed`);
      await this.saveFailedAccounts();
    }
  }

  /**
   * Get list of healthy accounts (not in failed list)
   */
  getHealthyAccounts(allAccountIds) {
    return allAccountIds.filter(id => !this.failedAccounts.has(id));
  }

  /**
   * Increment request count for an account
   * @param {string} accountId - The account ID
   */
  async incrementRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    const currentCount = this.requestCount.get(accountId) || 0;
    this.requestCount.set(accountId, currentCount + 1);
    
    // Schedule save instead of saving immediately
    this.scheduleSave();
  }

  /**
   * Record token usage for an account
   * @param {string} accountId - The account ID
   * @param {number} inputTokens - Number of input tokens
   * @param {number} outputTokens - Number of output tokens
   */
  async recordTokenUsage(accountId, inputTokens, outputTokens) {
    try {
      // Get current date in YYYY-MM-DD format
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Initialize token usage array for this account if it doesn't exist
      if (!this.tokenUsage.has(accountId)) {
        this.tokenUsage.set(accountId, []);
      }
      
      const accountUsage = this.tokenUsage.get(accountId);
      
      // Find existing entry for today
      let todayEntry = accountUsage.find(entry => entry.date === currentDate);
      
      if (todayEntry) {
        // Update existing entry
        todayEntry.inputTokens += inputTokens;
        todayEntry.outputTokens += outputTokens;
      } else {
        // Create new entry for today
        accountUsage.push({
          date: currentDate,
          inputTokens: inputTokens,
          outputTokens: outputTokens
        });
}
      
      // Schedule save instead of saving immediately
      this.scheduleSave();
    } catch (error) {
      console.warn('Failed to record token usage:', error.message);
    }
  }

  /**
   * Get request count for an account
   * @param {string} accountId - The account ID
   * @returns {number} The request count
   */
  getRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    return this.requestCount.get(accountId) || 0;
  }

  /**
   * Increment auth error count for an account
   * @param {string} accountId - The account ID
   */
  incrementAuthErrorCount(accountId) {
    const currentCount = this.authErrorCount.get(accountId) || 0;
    this.authErrorCount.set(accountId, currentCount + 1);
    return currentCount + 1;
  }

  /**
   * Reset auth error count for an account (when a successful request is made)
   * @param {string} accountId - The account ID
   */
  resetAuthErrorCount(accountId) {
    this.authErrorCount.set(accountId, 0);
  }

  /**
   * Get auth error count for an account
   * @param {string} accountId - The account ID
   * @returns {number} The auth error count
   */
  getAuthErrorCount(accountId) {
    return this.authErrorCount.get(accountId) || 0;
  }

  /**
   * Get the best available account based on token freshness
   * @returns {Object|null} Account info with {accountId, credentials}
   */
  async getBestAccount(exclude = new Set()) {
    // Get all available accounts
    const accountIds = this.authManager.getAccountIds();
    let healthyAccountIds = this.getHealthyAccounts(accountIds);
    if (exclude && exclude.size) {
      healthyAccountIds = healthyAccountIds.filter(id => !exclude.has(id));
    }

    if (healthyAccountIds.length === 0) {
      console.log('No healthy accounts available');
      return null;
    }

    // TODO: Check better log location for this for now im commenting this out
    // console.log(`Available healthy accounts: ${healthyAccountIds.join(', ')}`);

    // Load credentials for all healthy accounts and find freshest
    const accountCredentials = [];
    for (const accountId of healthyAccountIds) {
      // Accounts should already be loaded by the caller; fetch from memory
      const credentials = this.authManager.getAccountCredentials(accountId);
      if (credentials) {
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
        accountCredentials.push({
          accountId,
          credentials,
          minutesLeft
        });
      }
    }

    if (accountCredentials.length === 0) {
      console.log('No valid credentials found for any healthy account');
      return null;
    }

    // Sort by freshness (freshest first)
    accountCredentials.sort((a, b) => b.minutesLeft - a.minutesLeft);

    // Try accounts from freshest to least fresh
    for (const account of accountCredentials) {
      try {
        let selectedCredentials = account.credentials;

        // If account is expired, try to refresh it
        if (account.minutesLeft < 0) {
          console.log(`Account ${account.accountId} is expired, attempting refresh...`);
          try {
            // Refresh and ensure credentials are saved under the correct named account
            selectedCredentials = await this.authManager.performTokenRefresh(account.credentials, account.accountId);
            console.log(`Successfully refreshed account ${account.accountId}`);
          } catch (refreshError) {
            console.log(`Failed to refresh account ${account.accountId}: ${refreshError.message}`);
            continue; // Try next account
          }
        }

        // TODO: Check better log location for this for now im commenting this out
        //console.log(`Selected account ${account.accountId} (${account.minutesLeft.toFixed(1)} minutes left)`);
        
        return {
          accountId: account.accountId,
          credentials: selectedCredentials
        };
      } catch (error) {
        console.log(`Failed to prepare account ${account.accountId}: ${error.message}`);
        continue;
      }
    }

    console.log('Could not prepare any account for use');
    return null;
  }

  async getApiEndpoint(credentials) {
    // Check if credentials contain a custom endpoint
    if (credentials && credentials.resource_url) {
      let endpoint = credentials.resource_url;
      // Ensure it has a scheme
      if (!endpoint.startsWith('http')) {
        endpoint = `https://${endpoint}`;
      }
      // Ensure it has the /v1 suffix
      if (!endpoint.endsWith('/v1')) {
        if (endpoint.endsWith('/')) {
          endpoint += 'v1';
        } else {
          endpoint += '/v1';
        }
      }
      return endpoint;
    } else {
      // Use default endpoint
      return DEFAULT_QWEN_API_BASE_URL;
    }
  }

  async chatCompletions(request) {
    // Reset daily state and load accounts
    await this.resetFailedAccountsIfNeeded();
    await this.authManager.loadAllAccounts();
    const forcedAccountId = request.accountId;
    if (forcedAccountId) {
      // Use only the specified account; refresh once before request if needed, no rotation/retry
      const creds0 = this.authManager.getAccountCredentials(forcedAccountId);
      if (!creds0) {
        throw new Error(`No credentials found for account ${forcedAccountId}`);
      }
      let credentials = creds0;
      if (!this.authManager.isTokenValid(credentials)) {
        credentials = await this.authManager.performTokenRefresh(credentials, forcedAccountId);
      }
      const accountInfo = { accountId: forcedAccountId, credentials };
      return await this.processRequestWithAccount(request, accountInfo);
    }

    // Multi-account auto selection
    const accountIds = this.authManager.getAccountIds();
    if (accountIds.length === 0) {
      return this.chatCompletionsSingleAccount(request);
    }
    
    const tried = new Set();
    let lastError = null;
    const maxAttempts = 2;
    
    for (let i = 0; i < maxAttempts; i++) {
      const bestAccount = await this.getBestAccount(tried);
      if (!bestAccount) {
        break;
      }
      
      try {
        // Check if account is rate limited
        if (this.isAccountRateLimited(bestAccount.accountId)) {
          // Mark account as tried and continue to the next
          tried.add(bestAccount.accountId);
          continue;
        }
        
        // TODO: Check if we need locking based system for concurrent requests or not
        // Try to acquire lock for this account
        // const lockAcquired = await this.acquireAccountLock(bestAccount.accountId);
        // if (!lockAcquired) {
        //   // Account is in use, skip to next attempt
        //   tried.add(bestAccount.accountId);
        //   continue;
        // }
        
        try {
          // Increment request count after acquiring lock but before processing
          this.incrementAccountRequestCount(bestAccount.accountId);
          return await this.processRequestWithAccount(request, bestAccount);
        } finally {
          // Always release the lock after request is done (success or failure)
          // this.releaseAccountLock(bestAccount.accountId);
        }
      } catch (error) {
        lastError = error;
        await this.handleRequestError(error, bestAccount.accountId);
        tried.add(bestAccount.accountId);
        continue;
      }
    }
    
    if (lastError) throw lastError;
    throw new Error('No healthy accounts available');
  }

  /**
   * Process request with a specific account (no locking)
   */
  async processRequestWithAccount(request, accountInfo) {
    const { accountId, credentials } = accountInfo;
    
    // Get API endpoint
    const apiEndpoint = await this.getApiEndpoint(credentials);
    
    // Make API call
    const url = `${apiEndpoint}/chat/completions`;
    const model = request.model || DEFAULT_MODEL;
    
    // Process messages for vision model support
    const processedMessages = processMessagesForVision(request.messages, model);
    
    const payload = {
      model: model,
      messages: processedMessages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      tools: request.tools,
      tool_choice: request.tool_choice,
      reasoning: request.reasoning,
      stream: false
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${credentials.access_token}`,
    };

    // Increment request count for successful request
    await this.incrementRequestCount(accountId);

    // Log which account is being used with Request number
    console.log(`\x1b[36m[New Normal Request] Using account ${accountId} (${((credentials.expiry_date - Date.now()) / 60000).toFixed(1)} minutes left)) (Request #${this.getRequestCount(accountId)} today)\x1b[0m`);

    const response = await axios.post(url, payload, { 
      headers: headers,
      timeout: 300000, // 5 minutes timeout
      httpAgent,
      httpsAgent
    });
    
    // Reset auth error count on successful request
    this.resetAuthErrorCount(accountId);
    
    // Record token usage if available
    if (response.data && response.data.usage) {
      await this.recordTokenUsage(
        accountId, 
        response.data.usage.prompt_tokens || 0,
        response.data.usage.completion_tokens || 0
      );
    }
    
    console.log(`\x1b[32mRequest completed successfully using account ${accountId}\x1b[0m`);
    return response.data;
  }

  /**
   * Handle request errors with smart account management
   */
  async handleRequestError(error, accountId) {
    if (!error.response) {
      // Network or other non-API errors - don't mark account as failed
      return;
    }

    const status = error.response.status;
    const errorData = error.response.data || {};
    
    // Mark account as failed for specific error types
    if (status === 429 || // Rate limit/quota exceeded
        (status === 401 && errorData.error?.message?.includes('Invalid access token')) ||
        (status === 400 && errorData.error?.message?.includes('quota'))) {
      
      console.log(`\x1b[33mMarking account ${accountId} as failed due to ${status} error\x1b[0m`);
      await this.markAccountAsFailed(accountId);
    } else if (status === 401) {
      // Try to refresh token for other 401 errors
      try {
        console.log(`\x1b[33mAttempting token refresh for account ${accountId}\x1b[0m`);
        const credentials = this.authManager.getAccountCredentials(accountId);
        if (credentials) {
          await this.authManager.performTokenRefresh(credentials, accountId);
          console.log(`\x1b[32mSuccessfully refreshed token for account ${accountId}\x1b[0m`);
        }
      } catch (refreshError) {
        console.log(`\x1b[31mToken refresh failed for account ${accountId}, marking as failed\x1b[0m`);
        await this.markAccountAsFailed(accountId);
      }
    }
    // For 500/502/504 errors, don't mark account as failed (temporary server issues)
  }

  /**
   * Chat completions for single account mode
   */
  async chatCompletionsSingleAccount(request) {
    // Get a valid access token (automatically refreshes if needed)
    const accessToken = await this.authManager.getValidAccessToken();
    const credentials = await this.authManager.loadCredentials();
    const apiEndpoint = await this.getApiEndpoint(credentials);
    
    // Make API call
    const url = `${apiEndpoint}/chat/completions`;
    const model = request.model || DEFAULT_MODEL;
    
    // Process messages for vision model support
    const processedMessages = processMessagesForVision(request.messages, model);
    
    const payload = {
      model: model,
      messages: processedMessages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      tools: request.tools,
      tool_choice: request.tool_choice,
      reasoning: request.reasoning
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
    };
    
    try {
      // Increment request count for successful request
      await this.incrementRequestCount('default');

      // Log which account is being used with Request number
      console.log(`\x1b[36m[New Normal Request] Using account ${'default'} (${((credentials.expiry_date - Date.now()) / 60000).toFixed(1)} minutes left)) (Request #${this.getRequestCount('default')} today)\x1b[0m`);

      const response = await axios.post(url, payload, { headers, timeout: 300000, httpAgent, httpsAgent }); // 5 minute timeout
      // Reset auth error count on successful request (for consistency, even though we don't rotate)
      this.resetAuthErrorCount('default');

      // Record token usage if available in response
      if (response.data && response.data.usage) {
        const { prompt_tokens = 0, completion_tokens = 0 } = response.data.usage;
        await this.recordTokenUsage('default', prompt_tokens, completion_tokens);
      }
      
      return response.data;
    } catch (error) {
      // Check if this is an authentication error that might benefit from a retry
      if (isAuthError(error)) {
        // Increment auth error count (for tracking, even though we can't rotate)
        const authErrorCount = this.incrementAuthErrorCount('default');
        console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) (consecutive count: ${authErrorCount})\x1b[0m`);
        
        console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
        try {
          // Force refresh the token and retry once
          await this.authManager.performTokenRefresh(credentials);
          const newAccessToken = await this.authManager.getValidAccessToken();
          
          // Retry the request with the new token
          console.log('\x1b[36m%s\x1b[0m', 'Retrying request with refreshed token...');
          const retryHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${newAccessToken}`,
            'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
          };
          
          const retryResponse = await axios.post(url, payload, { headers: retryHeaders, timeout: 300000, httpAgent, httpsAgent });
          console.log('\x1b[32m%s\x1b[0m', 'Request succeeded after token refresh');
          // Reset auth error count on successful request
          this.resetAuthErrorCount('default');
          return retryResponse.data;
        } catch (retryError) {
          console.error('\x1b[31m%s\x1b[0m', 'Request failed even after token refresh');
          // If retry fails, throw the original error with additional context
          throw new Error(`Qwen API error (after token refresh attempt): ${error.response?.status || 'N/A'} ${JSON.stringify(error.response?.data || error.message)}`);
        }
      }
      
      if (error.response) {
        // The request was made and the server responded with a status code
        throw new Error(`Qwen API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(`Qwen API request failed: No response received`);
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`Qwen API request failed: ${error.message}`);
      }
    }
  }

  /**
   * Acquire a lock for an account to prevent concurrent requests
   * @param {string} accountId - The account ID to lock
   * @returns {Promise<boolean>} True if lock was acquired, false otherwise
   */
  async acquireAccountLock(accountId) {
    if (!this.accountLocks.has(accountId)) {
      // No one is using this account, acquire the lock
      this.accountLocks.set(accountId, true);
      return true;
    }
    
    // Account is currently in use, return false
    return false;
  }

  /**
   * Release a lock for an account
   * @param {string} accountId - The account ID to unlock
   */
  releaseAccountLock(accountId) {
    if (this.accountLocks.has(accountId)) {
      this.accountLocks.delete(accountId);
    }
  }

  /**
   * Check if account has exceeded rate limit
   * @param {string} accountId - The account ID to check
   * @returns {boolean} True if rate limit exceeded, false otherwise
   */
  isAccountRateLimited(accountId) {
    const now = Date.now();
    const accountData = this.accountRequestCounts.get(accountId) || { count: 0, resetTime: now + this.requestWindowDuration };
    
    // If window has passed, reset the count
    if (now >= accountData.resetTime) {
      accountData.count = 0;
      accountData.resetTime = now + this.requestWindowDuration;
    }
    
    // For Qwen accounts, we'll use a default limit of 3600 requests per hour (60 per minute)
    // But since we're checking per minute, that's 60 requests per minute
    const rateLimit = 60; // requests per window
    
    // Check if we've exceeded the rate limit
    if (accountData.count >= rateLimit) {
      console.log(`\x1b[33mAccount ${accountId} has exceeded rate limit (${rateLimit} requests per ${this.requestWindowDuration/1000}s window)\x1b[0m`);
      return true;
    }
    
    return false;
  }

  /**
   * Increment account request count
   * @param {string} accountId - The account ID to increment
   */
  incrementAccountRequestCount(accountId) {
    const now = Date.now();
    let accountData = this.accountRequestCounts.get(accountId);
    
    if (!accountData || now >= accountData.resetTime) {
      // Reset the window if it has passed
      accountData = { count: 0, resetTime: now + this.requestWindowDuration };
    }
    
    accountData.count++;
    this.accountRequestCounts.set(accountId, accountData);
  }

  async listModels() {
    console.log('Returning mock models list');
    
    // Return a mock list of Qwen models since Qwen API doesn't have this endpoint
    return {
      object: 'list',
      data: QWEN_MODELS
    };
  }

  /**
   * Stream chat completions from Qwen API
   * @param {Object} request - The chat completion request
   * @returns {Promise<Stream>} - A stream of SSE events
   */
  async streamChatCompletions(request) {
    // Reset daily state and load accounts
    await this.resetFailedAccountsIfNeeded();
    await this.authManager.loadAllAccounts();
    const forcedAccountId = request.accountId;
    const accountIds = this.authManager.getAccountIds();

    if (forcedAccountId) {
      const creds0 = this.authManager.getAccountCredentials(forcedAccountId);
      if (!creds0) throw new Error(`No credentials found for account ${forcedAccountId}`);
      let credentials = creds0;
      if (!this.authManager.isTokenValid(credentials)) {
        credentials = await this.authManager.performTokenRefresh(credentials, forcedAccountId);
      }
      const apiEndpoint = await this.getApiEndpoint(credentials);
      const url = `${apiEndpoint}/chat/completions`;
      const model = request.model || DEFAULT_MODEL;
      const processedMessages = processMessagesForVision(request.messages, model);
      const payload = { model, messages: processedMessages, temperature: request.temperature, max_tokens: request.max_tokens, top_p: request.top_p, tools: request.tools, tool_choice: request.tool_choice, reasoning: request.reasoning, stream: true, stream_options: { include_usage: true } };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.access_token}`, 'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)', 'Accept': 'text/event-stream' };
      
      // Increment request count for successful request
      await this.incrementRequestCount(forcedAccountId);

      // Log which account is being used with Request number
      console.log(`\x1b[36m[New Streaming Request] Using account ${forcedAccountId} (${((credentials.expiry_date - Date.now()) / 60000).toFixed(1)} minutes left)) (Request #${this.getRequestCount(forcedAccountId)} today)\x1b[0m`);
      
      const stream = new PassThrough();
      const response = await axios.post(url, payload, { headers, timeout: 300000, responseType: 'stream', httpAgent, httpsAgent });
      response.data.pipe(stream);
      return stream;
    }

    if (accountIds.length === 0) {
      // Use default single account mode
      const accessToken = await this.authManager.getValidAccessToken();
      const credentials = await this.authManager.loadCredentials();
      const apiEndpoint = await this.getApiEndpoint(credentials);
      const url = `${apiEndpoint}/chat/completions`;
      const model = request.model || DEFAULT_MODEL;
      const processedMessages = processMessagesForVision(request.messages, model);
      const payload = { model, messages: processedMessages, temperature: request.temperature, max_tokens: request.max_tokens, top_p: request.top_p, tools: request.tools, tool_choice: request.tool_choice, reasoning: request.reasoning, stream: true, stream_options: { include_usage: true } };
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)', 'Accept': 'text/event-stream' };
      
      // Increment request count for successful request
      await this.incrementRequestCount('default');

      // Log which account is being used with Request number
      console.log(`\x1b[36m[New Streaming Request] Using account ${'default'} (${((credentials.expiry_date - Date.now()) / 60000).toFixed(1)} minutes left)) (Request #${this.getRequestCount('default')} today)\x1b[0m`);
          
      
      const stream = new PassThrough();
      const response = await axios.post(url, payload, { headers, timeout: 300000, responseType: 'stream', httpAgent, httpsAgent });
      response.data.pipe(stream);
      return stream;
    }

    // Two-attempt rotation with account locking and rate limiting
    const tried = new Set();
    let lastError = null;
    for (let i = 0; i < 2; i++) {
      const bestAccount = await this.getBestAccount(tried);
      if (!bestAccount) break;
      const { accountId, credentials } = bestAccount;
      
      try {
        // Check if account is rate limited
        if (this.isAccountRateLimited(accountId)) {
          // Mark account as tried and continue to the next
          tried.add(accountId);
          continue;
        }
        
        // TODO: Check if we need locking based system for concurrent requests or not
        // Try to acquire lock for this account
        // const lockAcquired = await this.acquireAccountLock(accountId);
        // if (!lockAcquired) {
        //   // Account is in use, skip to next attempt
        //   tried.add(accountId);
        //   continue;
        // }
        
        try {
          const apiEndpoint = await this.getApiEndpoint(credentials);
          const url = `${apiEndpoint}/chat/completions`;
          const model = request.model || DEFAULT_MODEL;
          const processedMessages = processMessagesForVision(request.messages, model);
          const payload = { model, messages: processedMessages, temperature: request.temperature, max_tokens: request.max_tokens, top_p: request.top_p, tools: request.tools, tool_choice: request.tool_choice, reasoning: request.reasoning, stream: true, stream_options: { include_usage: true } };
          const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${credentials.access_token}`, 'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)', 'Accept': 'text/event-stream' };
          const stream = new PassThrough();
          
          // Increment request count after acquiring lock but before processing
          this.incrementAccountRequestCount(accountId);

          // Increment request count for successful request
          await this.incrementRequestCount(accountId);

          // Log which account is being used with Request number
          console.log(`\x1b[36m[New Streaming Request] Using account ${accountId} (${((credentials.expiry_date - Date.now()) / 60000).toFixed(1)} minutes left)) (Request #${this.getRequestCount(accountId)} today)\x1b[0m`);
          
          const response = await axios.post(url, payload, { headers, timeout: 300000, responseType: 'stream', httpAgent, httpsAgent });
          response.data.pipe(stream);
          return stream;
        } finally {
          // Always release the lock after request is done (success or failure)
          // this.releaseAccountLock(accountId);
        }
      } catch (error) {
        lastError = error;
        await this.handleRequestError(error, accountId);
        tried.add(accountId);
        continue;
      }
    }
    if (lastError) throw lastError;
    throw new Error('No healthy accounts available');
  }
}

module.exports = { QwenAPI };