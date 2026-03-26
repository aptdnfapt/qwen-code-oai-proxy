// src/config.js
require('dotenv').config();

module.exports = {
  // Server configuration
  port: parseInt(process.env.PORT) || 8080,
  host: process.env.HOST || 'localhost',
  
  // Streaming configuration
  stream: process.env.STREAM === 'true', // Disable streaming by default, enable only if STREAM=true
  
  // Qwen OAuth configuration
  qwen: {
    clientId: process.env.QWEN_CLIENT_ID || 'f0304373b74a44d2b584a3fb70ca9e56',
    clientSecret: process.env.QWEN_CLIENT_SECRET || '',
    baseUrl: process.env.QWEN_BASE_URL || 'https://chat.qwen.ai',
    deviceCodeEndpoint: process.env.QWEN_DEVICE_CODE_ENDPOINT || 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    tokenEndpoint: process.env.QWEN_TOKEN_ENDPOINT || 'https://chat.qwen.ai/api/v1/oauth2/token',
    scope: process.env.QWEN_SCOPE || 'openid profile email model.completion'
  },
  
  // Default model
  defaultModel: process.env.DEFAULT_MODEL || 'qwen3-coder-plus',

  // Default parameters for requests if not specified in the request
  defaultTemperature: parseFloat(process.env.DEFAULT_TEMPERATURE) || 0.7,
  defaultMaxTokens: parseInt(process.env.DEFAULT_MAX_TOKENS) || 65536,
  defaultTopP: parseFloat(process.env.DEFAULT_TOP_P) || 0.8,
  defaultTopK: parseInt(process.env.DEFAULT_TOP_K) || 20,
  defaultRepetitionPenalty: parseFloat(process.env.DEFAULT_REPETITION_PENALTY) || 1.05,
  
  // Token refresh buffer (milliseconds)
  tokenRefreshBuffer: parseInt(process.env.TOKEN_REFRESH_BUFFER) || 30000, // 30 seconds
  
  // Default account to use first (if available)
  defaultAccount: process.env.DEFAULT_ACCOUNT || '',
  
  // Qwen Code authentication usage
  // Set to false to disable using the default ~/.qwen/oauth_creds.json file
  qwenCodeAuthUse: process.env.QWEN_CODE_AUTH_USE !== 'false', // true by default
  
  // Logging configuration (handled in utils/fileLogger.js)
  // LOG_LEVEL env var: off, error, error-debug, debug
  // ERROR_LOG_MAX_MB, ERROR_LOG_MAX_DAYS, MAX_DEBUG_LOGS env vars (legacy aliases: DEBUG_LOG, LOG_FILE_LIMIT)

  // Retry configuration
  maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '1000'),

  // API Key configuration
  apiKey: process.env.API_KEY ?
    process.env.API_KEY.split(',').map(key => key.trim()).filter(key => key.length > 0) :
    null, // API key(s) for securing access (can be multiple, comma-separated)

  // System Prompt configuration
  systemPrompt: {
    enabled: process.env.SYSTEM_PROMPT_ENABLED !== 'false', // Enable/disable system prompt injection (enabled by default)
    prompt: process.env.SYSTEM_PROMPT_FILE ?
      require('fs').readFileSync(process.env.SYSTEM_PROMPT_FILE, 'utf8') :
      null, // Custom system prompt from file
    appendMode: process.env.SYSTEM_PROMPT_MODE || 'prepend', // 'prepend' or 'append'
    modelFilter: process.env.SYSTEM_PROMPT_MODELS ?
      process.env.SYSTEM_PROMPT_MODELS.split(',').map(m => m.trim()) :
      null // Comma-separated list of models to apply to (null = all models)
  }
};
