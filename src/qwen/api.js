const axios = require('axios');
const { QwenAuthManager } = require('./auth.js');
const { PassThrough, Transform } = require('stream');
const path = require('path');
const { promises: fs } = require('fs');

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
    id: 'qwen3-coder-turbo',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-plus',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-turbo',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  }
];

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

// Utility function to safely stringify objects with circular references
function safeStringify(obj, space = 2) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (val !== null && typeof val === "object") {
      if (seen.has(val)) {
        return "[Circular]";
      }
      seen.add(val);
    }
    return val;
  }, space);
}

/**
 * Transform stream to properly handle SSE chunks and prevent missing blocks
 */
class SSEChunkHandler extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: false });
    this.buffer = '';
    this.debug = process.env.DEBUG_STREAMING === 'true';
  }

  _transform(chunk, encoding, callback) {
    try {
      // Convert chunk to string
      const chunkStr = chunk.toString();
      
      if (this.debug) {
        console.log('[DEBUG] Received raw chunk:', JSON.stringify(chunkStr));
      }
      
      // Append to buffer
      this.buffer += chunkStr;
      
      // Process complete lines
      const lines = this.buffer.split('\n');
      
      // Keep the last incomplete line in buffer only if it doesn't look like it's in the middle of a tag
      // Check if the last line ends with an incomplete tag (like '<th' or similar)
      const lastLine = lines[lines.length - 1] || '';
      const looksIncomplete = this.looksLikeIncompleteTag(lastLine);
      
      // If it looks incomplete, keep it in the buffer for the next chunk
      if (looksIncomplete) {
        this.buffer = lines.pop() || '';
      } else {
        // Otherwise, move the last line to processing
        this.buffer = lines.pop() || '';
      }
      
      // Process complete lines
      for (const line of lines) {
        // Ensure proper SSE format
        let formattedLine = line;
        if (line.startsWith('data:') && !line.endsWith('\n')) {
          formattedLine += '\n';
        } else if (line.startsWith('event:') && !line.endsWith('\n')) {
          formattedLine += '\n';
        } else if (line === '' && !line.endsWith('\n')) {
          formattedLine += '\n';
        }
        
        if (this.debug) {
          console.log('[DEBUG] Sending formatted line:', JSON.stringify(formattedLine));
        }
        
        // Push the formatted line
        this.push(formattedLine);
      }
      
      callback();
    } catch (error) {
      console.error('[ERROR] Error processing chunk:', error);
      callback(error);
    }
  }
  
  /**
   * Check if a line looks like it's in the middle of an incomplete tag
   * @param {string} line - The line to check
   * @returns {boolean} - True if the line looks incomplete
   */
  looksLikeIncompleteTag(line) {
    // Check for common incomplete tag patterns
    const incompletePatterns = [
      /<[^>]*$/,  // Opening tag that's not closed
      /<[a-zA-Z]*$/,  // Incomplete tag name
      /<t[h]*$/,  // Incomplete <th or <thinking tag
      /<thinkin[g]*$/,  // Incomplete <thinking tag
    ];
    
    // If any pattern matches, it looks incomplete
    return incompletePatterns.some(pattern => pattern.test(line));
  }
  
  _flush(callback) {
    // Send any remaining buffer data
    if (this.buffer) {
      if (this.debug) {
        console.log('[DEBUG] Flushing remaining buffer:', JSON.stringify(this.buffer));
      }
      // Ensure proper SSE format for the final buffer content
      let formattedBuffer = this.buffer;
      if (this.buffer.startsWith('data:') && !this.buffer.endsWith('\n')) {
        formattedBuffer += '\n';
      } else if (this.buffer.startsWith('event:') && !this.buffer.endsWith('\n')) {
        formattedBuffer += '\n';
      } else if (this.buffer === '' && !this.buffer.endsWith('\n')) {
        formattedBuffer += '\n';
      }
      
      this.push(formattedBuffer);
      this.buffer = '';
    }
    callback();
  }
}

class QwenAPI {
  constructor() {
    this.authManager = new QwenAuthManager();
    this.requestCount = new Map(); // Track requests per account
    this.authErrorCount = new Map(); // Track consecutive auth errors per account
    this.tokenUsage = new Map(); // Track token usage per account
    this.lastResetDate = new Date().toISOString().split('T')[0]; // Track last reset date (UTC)
    this.requestCountFile = path.join(this.authManager.qwenDir, 'request_counts.json');
    this.loadRequestCounts();
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
    } catch (error) {
      console.warn('Failed to save request counts:', error.message);
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
   * Increment request count for an account
   * @param {string} accountId - The account ID
   */
  async incrementRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    const currentCount = this.requestCount.get(accountId) || 0;
    this.requestCount.set(accountId, currentCount + 1);
    await this.saveRequestCounts();
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
      
      // Save the updated token usage data
      await this.saveRequestCounts();
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
    // Load all accounts for multi-account support
    await this.authManager.loadAllAccounts();
    const accountIds = this.authManager.getAccountIds();
    
    // If no additional accounts, use default behavior
    if (accountIds.length === 0) {
      return this.chatCompletionsSingleAccount(request);
    }
    
    // Start with the default account if specified, otherwise start with the first account
    let currentAccountIndex = 0;
    const defaultAccount = require('../config.js').defaultAccount;
    if (defaultAccount && accountIds.includes(defaultAccount)) {
      currentAccountIndex = accountIds.indexOf(defaultAccount);
      console.log(`\x1b[36mUsing default account: ${defaultAccount}\x1b[0m`);
    }
    let lastError = null;
    const maxRetries = accountIds.length;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Get the current account (sticky until quota error)
        const accountId = accountIds[currentAccountIndex];
        const credentials = this.authManager.getAccountCredentials(accountId);
        
        if (!credentials) {
          // Move to next account if current one is invalid
          currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
          continue;
        }
        
        // Show which account we're using
        console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId) + 1} today)\x1b[0m`);
        
        // Get a valid access token for this account
        const accessToken = await this.authManager.getValidAccessToken(accountId);
        
        // Get API endpoint
        const apiEndpoint = await this.getApiEndpoint(credentials);
        
        // Make API call
        const url = `${apiEndpoint}/chat/completions`;
        const payload = {
          model: request.model || DEFAULT_MODEL,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          top_p: request.top_p,
          tools: request.tools,
          tool_choice: request.tool_choice
        };
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
        };
        
        // Increment request count for this account
        await this.incrementRequestCount(accountId);
        console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId)} today)\x1b[0m`);
        
        const response = await axios.post(url, payload, { headers, timeout: 300000 }); // 5 minute timeout
        // Reset auth error count on successful request
        this.resetAuthErrorCount(accountId);
        
        // Record token usage if available in response
        if (response.data && response.data.usage) {
          const { prompt_tokens = 0, completion_tokens = 0 } = response.data.usage;
          await this.recordTokenUsage(accountId, prompt_tokens, completion_tokens);
        }
        
        return response.data;
      } catch (error) {
        lastError = error;
        
        // Check if this is a quota exceeded error
        if (isQuotaExceededError(error)) {
          console.log(`\x1b[33mAccount ${accountId} quota exceeded (Request #${this.getRequestCount(accountId)}), rotating to next account...\\x1b[0m`);
          // Move to next account for the next request
          currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
          // Peek at the next account to show which one we're rotating to
          const nextAccountId = accountIds[currentAccountIndex];
          console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
          // Continue to next account
          continue;
        }
        
        // Check if this is an authentication error that might benefit from a retry
        if (isAuthError(error)) {
          // Increment auth error count for this account
          const authErrorCount = this.incrementAuthErrorCount(accountId);
          console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) for account ${accountId} (consecutive count: ${authErrorCount})\x1b[0m`);
          
          // If we've had 3 consecutive auth errors, rotate to next account
          if (authErrorCount >= 3) {
            console.log(`\x1b[33mAccount ${accountId} has had ${authErrorCount} consecutive auth errors, rotating to next account...\\x1b[0m`);
            // Move to next account for the next request
            currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
            // Peek at the next account to show which one we're rotating to
            const nextAccountId = accountIds[currentAccountIndex];
            console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
            // Continue to next account
            continue;
          }
          
          // Try token refresh for auth errors (less than 3 consecutive)
          console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
          try {
            // Force refresh the token and retry once
            await this.authManager.performTokenRefresh(credentials, accountId);
            const newAccessToken = await this.authManager.getValidAccessToken(accountId);
            
            // Retry the request with the new token
            console.log('\x1b[36m%s\x1b[0m', 'Retrying request with refreshed token...');
            const retryHeaders = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newAccessToken}`,
              'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
            };
            
            const retryResponse = await axios.post(url, payload, { headers: retryHeaders, timeout: 300000 });
            console.log('\x1b[32m%s\x1b[0m', 'Request succeeded after token refresh');
            // Reset auth error count on successful request
            this.resetAuthErrorCount(accountId);
            return retryResponse.data;
          } catch (retryError) {
            console.error('\x1b[31m%s\x1b[0m', 'Request failed even after token refresh');
            // If retry fails, continue to next account
            continue;
          }
        }
        
        // For other errors, re-throw
        if (error.response) {
          // The request was made and the server responded with a status code
          throw new Error(`Qwen API error: ${error.response.status} ${safeStringify(error.response.data)}`);
        } else if (error.request) {
          // The request was made but no response was received
          throw new Error(`Qwen API request failed: No response received`);
        } else {
          // Something happened in setting up the request that triggered an Error
          throw new Error(`Qwen API request failed: ${error.message}`);
        }
      }
    }
    
    // If we get here, all accounts failed
    throw new Error(`All accounts failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  async chatCompletionsSingleAccount(request) {
    // Get a valid access token (automatically refreshes if needed)
    const accessToken = await this.authManager.getValidAccessToken();
    const credentials = await this.authManager.loadCredentials();
    const apiEndpoint = await this.getApiEndpoint(credentials);
    
    // Make API call
    const url = `${apiEndpoint}/chat/completions`;
    const payload = {
      model: request.model || DEFAULT_MODEL,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      tools: request.tools,
      tool_choice: request.tool_choice
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
    };
    
    try {
      const response = await axios.post(url, payload, { headers, timeout: 300000 }); // 5 minute timeout
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
          
          const retryResponse = await axios.post(url, payload, { headers: retryHeaders, timeout: 300000 });
          console.log('\x1b[32m%s\x1b[0m', 'Request succeeded after token refresh');
          // Reset auth error count on successful request
          this.resetAuthErrorCount('default');
          return retryResponse.data;
        } catch (retryError) {
          console.error('\x1b[31m%s\x1b[0m', 'Request failed even after token refresh');
          // If retry fails, throw the original error with additional context
          throw new Error(`Qwen API error (after token refresh attempt): ${error.response?.status || 'N/A'} ${safeStringify(error.response?.data || error.message)}`);
        }
      }
      
      if (error.response) {
        // The request was made and the server responded with a status code
        throw new Error(`Qwen API error: ${error.response.status} ${safeStringify(error.response.data)}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(`Qwen API request failed: No response received`);
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`Qwen API request failed: ${error.message}`);
      }
    }
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
    // Load all accounts for multi-account support
    await this.authManager.loadAllAccounts();
    const accountIds = this.authManager.getAccountIds();
    
    // If no additional accounts, use default behavior
    if (accountIds.length === 0) {
      // Get a valid access token (automatically refreshes if needed)
      const accessToken = await this.authManager.getValidAccessToken();
      const credentials = await this.authManager.loadCredentials();
      const apiEndpoint = await this.getApiEndpoint(credentials);
      
      // Make streaming API call
      const url = `${apiEndpoint}/chat/completions`;
      const payload = {
        model: request.model || DEFAULT_MODEL,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        tools: request.tools,
        tool_choice: request.tool_choice,
        stream: true, // Enable streaming
        stream_options: { include_usage: true } // Include usage data in final chunk
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
        'Accept': 'text/event-stream'
      };
      
      try {
        // Create a pass-through stream to forward the response
        const stream = new PassThrough();
        
        // Create chunk handler for proper SSE formatting
        const chunkHandler = new SSEChunkHandler();
        
        // Variables to capture usage data from streaming response
        let usageData = null;
        
        // Make the HTTP request with streaming response
        const response = await axios.post(url, payload, {
          headers,
          timeout: 300000, // 5 minute timeout
          responseType: 'stream'
        });
        
        // Intercept the response stream to capture usage data
        response.data.on('data', (chunk) => {
          const chunkString = chunk.toString();
          // Look for usage data in the chunk (typically in final chunk with [DONE] marker)
          if (chunkString.includes('\"usage\":')) {
            try {
              // Extract usage data from the chunk
              const lines = chunkString.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.substring(6);
                  if (data.trim() !== '[DONE]') {
                    const jsonData = JSON.parse(data);
                    if (jsonData.usage) {
                      usageData = jsonData.usage;
                    }
                  }
                }
              }
            } catch (parseError) {
              // Ignore parsing errors
            }
          }
        });
        
        // Record token usage when stream ends
        response.data.on('end', async () => {
          if (usageData) {
            const { prompt_tokens = 0, completion_tokens = 0 } = usageData;
            await this.recordTokenUsage('default', prompt_tokens, completion_tokens);
          }
        });
        
        // Pipe the response stream through our chunk handler to the pass-through stream
        response.data.pipe(chunkHandler).pipe(stream);
        
        // Reset auth error count on successful request start
        this.resetAuthErrorCount('default');
        
        // Handle authentication errors during streaming
        response.data.on('error', async (error) => {
          if (isAuthError(error)) {
            // Increment auth error count (for tracking, even though we can't rotate)
            const authErrorCount = this.incrementAuthErrorCount('default');
            console.log(`\x1b[33mDetected auth error during streaming (${error.response?.status || 'N/A'}) (consecutive count: ${authErrorCount})\x1b[0m`);
            
            console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh during streaming...`);
            try {
              // Force refresh the token
              await this.authManager.performTokenRefresh(credentials);
              console.log('\x1b[32m%s\x1b[0m', 'Token refreshed successfully during streaming');
            } catch (refreshError) {
              console.error('\x1b[31m%s\x1b[0m', 'Token refresh failed during streaming');
              stream.emit('error', new Error(`Qwen API auth error during streaming: ${error.message}`));
            }
          } else {
            stream.emit('error', error);
          }
        });
        
        // Handle chunk handler errors
        chunkHandler.on('error', (error) => {
          console.error('[ERROR] Chunk handler error:', error);
          stream.emit('error', error);
        });
        
        return stream;
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
            console.log('\x1b[36m%s\x1b[0m', 'Retrying streaming request with refreshed token...');
            const retryHeaders = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newAccessToken}`,
              'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
              'Accept': 'text/event-stream'
            };
            
            // Create a new pass-through stream for the retry
            const retryStream = new PassThrough();
            
            // Create chunk handler for proper SSE formatting
            const retryChunkHandler = new SSEChunkHandler();
            
            const retryResponse = await axios.post(url, payload, {
              headers: retryHeaders,
              timeout: 300000,
              responseType: 'stream'
            });
            
            retryResponse.data.pipe(retryChunkHandler).pipe(retryStream);
            console.log('\x1b[32m%s\x1b[0m', 'Streaming request succeeded after token refresh');
            // Reset auth error count on successful request
            this.resetAuthErrorCount('default');
            return retryStream;
          } catch (retryError) {
            console.error('\x1b[31m%s\x1b[0m', 'Streaming request failed even after token refresh');
            // If retry fails, throw the original error with additional context
            throw new Error(`Qwen API streaming error (after token refresh attempt): ${error.response?.status || 'N/A'} ${safeStringify(error.response?.data || error.message)}`);
          }
        }
        
        if (error.response) {
          // The request was made and the server responded with a status code
          throw new Error(`Qwen API error: ${error.response.status} ${safeStringify(error.response.data)}`);
        } else if (error.request) {
          // The request was made but no response was received
          throw new Error(`Qwen API request failed: No response received`);
        } else {
          // Something happened in setting up the request that triggered an Error
          throw new Error(`Qwen API request failed: ${error.message}`);
        }
      }
    } else {
      // Start with the default account if specified, otherwise start with the first account
      let currentAccountIndex = 0;
      const defaultAccount = require('../config.js').defaultAccount;
      if (defaultAccount && accountIds.includes(defaultAccount)) {
        currentAccountIndex = accountIds.indexOf(defaultAccount);
        console.log(`\x1b[36mUsing default account: ${defaultAccount}\x1b[0m`);
      }
      let lastError = null;
      const maxRetries = accountIds.length;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          // Get the current account (sticky until quota error)
          const accountId = accountIds[currentAccountIndex];
          const credentials = this.authManager.getAccountCredentials(accountId);
          
          if (!credentials) {
            // Move to next account if current one is invalid
            currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
            continue;
          }
          
          // Show which account we're using
          console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId) + 1} today)\x1b[0m`);
          
          // Get a valid access token for this account
          const accessToken = await this.authManager.getValidAccessToken(accountId);
          
          // Get API endpoint
          const apiEndpoint = await this.getApiEndpoint(credentials);
          
          // Make streaming API call
          const url = `${apiEndpoint}/chat/completions`;
          const payload = {
            model: request.model || DEFAULT_MODEL,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
            tools: request.tools,
            tool_choice: request.tool_choice,
            stream: true, // Enable streaming
            stream_options: { include_usage: true } // Include usage data in final chunk
          };
          
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
            'Accept': 'text/event-stream'
          };
          
          // Increment request count for this account
          await this.incrementRequestCount(accountId);
          
          // Create a pass-through stream to forward the response
          const stream = new PassThrough();
          
          // Create chunk handler for proper SSE formatting
          const chunkHandler = new SSEChunkHandler();
          
          // Variables to capture usage data from streaming response
          let usageData = null;
          
          // Make the HTTP request with streaming response
          const response = await axios.post(url, payload, {
            headers,
            timeout: 300000, // 5 minute timeout
            responseType: 'stream'
          });
          
          // Intercept the response stream to capture usage data
          response.data.on('data', (chunk) => {
            const chunkString = chunk.toString();
            // Look for usage data in the chunk (typically in final chunk with [DONE] marker)
            if (chunkString.includes('\"usage\":')) {
              try {
                // Extract usage data from the chunk
                const lines = chunkString.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    if (data.trim() !== '[DONE]') {
                      const jsonData = JSON.parse(data);
                      if (jsonData.usage) {
                        usageData = jsonData.usage;
                      }
                    }
                  }
                }
              } catch (parseError) {
                // Ignore parsing errors
              }
            }
          });
          
          // Record token usage when stream ends
          response.data.on('end', async () => {
            if (usageData) {
              const { prompt_tokens = 0, completion_tokens = 0 } = usageData;
              await this.recordTokenUsage(accountId, prompt_tokens, completion_tokens);
            }
          });
          
          // Pipe the response stream through our chunk handler to the pass-through stream
          response.data.pipe(chunkHandler).pipe(stream);
          
          // Reset auth error count on successful request start
          this.resetAuthErrorCount(accountId);
          
          // Handle authentication errors during streaming
          response.data.on('error', async (error) => {
            if (isAuthError(error)) {
              // Increment auth error count for this account
              const authErrorCount = this.incrementAuthErrorCount(accountId);
              console.log(`\x1b[33mDetected auth error during streaming (${error.response?.status || 'N/A'}) for account ${accountId} (consecutive count: ${authErrorCount})\x1b[0m`);
              
              // If we've had 3 consecutive auth errors, emit an error to trigger rotation
              if (authErrorCount >= 3) {
                console.log(`\x1b[33mAccount ${accountId} has had ${authErrorCount} consecutive auth errors during streaming, triggering rotation...\\x1b[0m`);
                stream.emit('error', new Error(`Account ${accountId} has consecutive auth errors requiring rotation`));
              } else {
                console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh during streaming...`);
                try {
                  // Force refresh the token
                  await this.authManager.performTokenRefresh(credentials, accountId);
                  console.log('\x1b[32m%s\x1b[0m', 'Token refreshed successfully during streaming');
                } catch (refreshError) {
                  console.error('\x1b[31m%s\x1b[0m', 'Token refresh failed during streaming');
                  stream.emit('error', new Error(`Qwen API auth error during streaming: ${error.message}`));
                }
              }
            } else {
              stream.emit('error', error);
            }
          });
          
          // Handle chunk handler errors
          chunkHandler.on('error', (error) => {
            console.error('[ERROR] Chunk handler error:', error);
            stream.emit('error', error);
          });
          
          return stream;
        } catch (error) {
          lastError = error;
          
          // Check if this is a quota exceeded error
          if (isQuotaExceededError(error)) {
            console.log(`\x1b[33mAccount ${accountId} quota exceeded (Request #${this.getRequestCount(accountId)}), rotating to next account...\\x1b[0m`);
            // Move to next account for the next request
            currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
            // Peek at the next account to show which one we're rotating to
            const nextAccountId = accountIds[currentAccountIndex];
            console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
            // Continue to next account
            continue;
          }
          
          // Check if this is an authentication error that might benefit from a retry
          if (isAuthError(error)) {
            // Get current account info
            const accountId = accountIds[currentAccountIndex];
            
            // Increment auth error count for this account
            const authErrorCount = this.incrementAuthErrorCount(accountId);
            console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) for account ${accountId} (consecutive count: ${authErrorCount})\x1b[0m`);
            
            // If we've had 3 consecutive auth errors, rotate to next account
            if (authErrorCount >= 3) {
              console.log(`\x1b[33mAccount ${accountId} has had ${authErrorCount} consecutive auth errors, rotating to next account...\\x1b[0m`);
              // Move to next account for the next request
              currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
              // Peek at the next account to show which one we're rotating to
              const nextAccountId = accountIds[currentAccountIndex];
              console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
              // Continue to next account
              continue;
            }
            
            // Try token refresh for auth errors (less than 3 consecutive)
            console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
            try {
              const credentials = this.authManager.getAccountCredentials(accountId);
              if (credentials) {
                // Force refresh the token and retry once
                await this.authManager.performTokenRefresh(credentials, accountId);
                const newAccessToken = await this.authManager.getValidAccessToken(accountId);
                
                // Retry the request with the new token
                console.log('\x1b[36m%s\x1b[0m', 'Retrying streaming request with refreshed token...');
                const retryHeaders = {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${newAccessToken}`,
                  'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
                  'Accept': 'text/event-stream'
                };
                
                // Create a new pass-through stream for the retry
                const retryStream = new PassThrough();
                
                // Create chunk handler for proper SSE formatting
                const retryChunkHandler = new SSEChunkHandler();
                
                const retryResponse = await axios.post(url, payload, {
                  headers: retryHeaders,
                  timeout: 300000,
                  responseType: 'stream'
                });
                
                retryResponse.data.pipe(retryChunkHandler).pipe(retryStream);
                console.log('\x1b[32m%s\x1b[0m', 'Streaming request succeeded after token refresh');
                // Reset auth error count on successful request
                this.resetAuthErrorCount(accountId);
                return retryStream;
              }
            } catch (retryError) {
              console.error('\x1b[31m%s\x1b[0m', 'Streaming request failed even after token refresh');
              // If retry fails, continue to next account
              continue;
            }
          }
          
          // For other errors, re-throw
          if (error.response) {
            // The request was made and the server responded with a status code
            throw new Error(`Qwen API error: ${error.response.status} ${safeStringify(error.response.data)}`);
          } else if (error.request) {
            // The request was made but no response was received
            throw new Error(`Qwen API request failed: No response received`);
          } else {
            // Something happened in setting up the request that triggered an Error
            throw new Error(`Qwen API request failed: ${error.message}`);
          }
        }
      }
      
      // If we get here, all accounts failed
      throw new Error(`All accounts failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }
  }
}

module.exports = { QwenAPI, SSEChunkHandler };