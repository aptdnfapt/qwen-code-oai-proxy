class QwenOpenAIProxy {
  constructor(dependencies) {
    this.qwenAPI = dependencies.qwenAPI;
    this.authService = dependencies.authService || dependencies.authManager || this.qwenAPI.authManager;
    this.config = dependencies.config;
    this.countTokens = dependencies.countTokens;
    this.ErrorFormatter = dependencies.ErrorFormatter;
    this.systemPromptTransformer = dependencies.systemPromptTransformer;
    this.liveLogger = dependencies.liveLogger;
    this.fileLogger = dependencies.fileLogger;
  }

  createRequestId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  async handleChatCompletion(req, res) {
    const requestId = this.createRequestId();
    const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
    const model = req.body.model || this.config.defaultModel;
    const startTime = Date.now();
    const displayAccount = accountId ? accountId.substring(0, 8) : 'default';
    const requestNum = this.qwenAPI.getRequestCount(accountId || 'default');
    const isStreaming = req.body.stream === true;

    try {
      const tokenCount = this.countTokens(req.body.messages);

      this.liveLogger.proxyRequest(requestId, model, displayAccount, tokenCount, requestNum, isStreaming);

      if (isStreaming) {
        await this.handleStreamingChatCompletion(req, res, requestId, accountId, model, startTime);
      } else {
        await this.handleRegularChatCompletion(req, res, requestId, accountId, model, startTime);
      }
    } catch (error) {
      if (error.message.includes('Validation error')) {
        this.liveLogger.proxyError(requestId, 400, displayAccount, error.message);
        const validationError = this.ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      this.fileLogger.logError(requestId, displayAccount, 500, error);

      this.liveLogger.proxyError(requestId, 500, displayAccount, error.message);

      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = this.ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }

      const apiError = this.ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleRegularChatCompletion(req, res, requestId, accountId, model, startTime) {
    const displayAccount = accountId ? accountId.substring(0, 8) : 'default';

    try {
      const transformedMessages = this.systemPromptTransformer.transform(
        req.body.messages,
        req.body.model || this.config.defaultModel,
      );

      const response = await this.qwenAPI.chatCompletions({
        model: req.body.model || this.config.defaultModel,
        messages: transformedMessages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature || this.config.defaultTemperature,
        max_tokens: req.body.max_tokens || this.config.defaultMaxTokens,
        top_p: req.body.top_p || this.config.defaultTopP,
        top_k: req.body.top_k || this.config.defaultTopK,
        repetition_penalty: req.body.repetition_penalty || this.config.defaultRepetitionPenalty,
        reasoning: req.body.reasoning,
        accountId,
      });

      const latency = Date.now() - startTime;
      const inputTokens = response?.usage?.prompt_tokens || 0;
      const outputTokens = response?.usage?.completion_tokens || 0;
      const qwenId = response?.id ? response.id.replace('chatcmpl-', '').substring(0, 8) : null;

      if (this.fileLogger.isDebugLogging) {
        const logContent = this.fileLogger.formatLogContent(requestId, req, { model, messages: transformedMessages }, 200, latency, response);
        this.fileLogger.logToFile(requestId, logContent, 200);
      }

      this.liveLogger.proxyResponse(requestId, 200, displayAccount, latency, inputTokens, outputTokens, qwenId);

      res.json(response);
    } catch (error) {
      const statusCode = error.response?.status || 500;

      this.fileLogger.logError(requestId, displayAccount, statusCode, error);

      this.liveLogger.proxyError(requestId, statusCode, displayAccount, error.message);

      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = this.ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }

      throw error;
    }
  }

  async handleStreamingChatCompletion(req, res, requestId, accountId, model, startTime) {
    const displayAccount = accountId ? accountId.substring(0, 8) : 'default';

    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const transformedMessages = this.systemPromptTransformer.transform(
        req.body.messages,
        req.body.model || this.config.defaultModel,
      );

      const stream = await this.qwenAPI.streamChatCompletions({
        model: req.body.model || this.config.defaultModel,
        messages: transformedMessages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature || this.config.defaultTemperature,
        max_tokens: req.body.max_tokens || this.config.defaultMaxTokens,
        top_p: req.body.top_p || this.config.defaultTopP,
        top_k: req.body.top_k || this.config.defaultTopK,
        repetition_penalty: req.body.repetition_penalty || this.config.defaultRepetitionPenalty,
        reasoning: req.body.reasoning,
        accountId,
      });

      if (this.fileLogger.isDebugLogging) {
        const logContent = this.fileLogger.formatLogContent(requestId, req, { model, messages: transformedMessages }, 200, 0, { streaming: true });
        this.fileLogger.logToFile(requestId, logContent, 200);
      }

      let qwenId = null;
      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && !qwenId) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                const json = JSON.parse(data);
                if (json.id) {
                  qwenId = json.id.replace('chatcmpl-', '');
                }
              } catch (_ignored) {
                // no-op
              }
            }
          }
        }

        res.write(chunk);
      });

      stream.on('end', () => {
        const latency = Date.now() - startTime;
        const qwenIdShort = qwenId ? qwenId.substring(0, 8) : null;
        this.liveLogger.proxyResponse(requestId, 200, displayAccount, latency, 0, 0, qwenIdShort);
        res.end();
      });

      stream.on('error', (error) => {
        this.fileLogger.logError(requestId, displayAccount, 500, error);
        this.liveLogger.proxyError(requestId, 500, displayAccount, error.message);
        if (!res.headersSent) {
          const apiError = this.ErrorFormatter.openAIApiError(error.message, 'streaming_error');
          res.status(apiError.status).json(apiError.body);
        }
        res.end();
      });

      req.on('close', () => {
        stream.destroy();
      });
    } catch (error) {
      const statusCode = error.response?.status || 500;

      this.fileLogger.logError(requestId, displayAccount, statusCode, error);

      this.liveLogger.proxyError(requestId, statusCode, displayAccount, error.message);

      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = this.ErrorFormatter.openAIAuthError();
        if (!res.headersSent) {
          res.status(authError.status).json(authError.body);
          res.end();
        }
        return;
      }

      const apiError = this.ErrorFormatter.openAIApiError(error.message);
      if (!res.headersSent) {
        res.status(apiError.status).json(apiError.body);
        res.end();
      }
    }
  }

  async handleModels(req, res) {
    const requestId = this.createRequestId();
    const startTime = Date.now();

    try {
      const models = await this.qwenAPI.listModels();

      const latency = Date.now() - startTime;
      this.liveLogger.proxyResponse(requestId, 200, 'system', latency, 0, 0);

      res.json(models);
    } catch (error) {
      this.liveLogger.proxyError(requestId, 500, 'system', error.message);

      this.fileLogger.logError(requestId, 'system', 500, error);

      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        return res.status(401).json({
          error: {
            message: 'Not authenticated with Qwen. Please authenticate first.',
            type: 'authentication_error',
          },
        });
      }

      res.status(500).json({
        error: {
          message: error.message,
          type: 'internal_server_error',
        },
      });
    }
  }

  async handleAuthInitiate(req, res) {
    const requestId = this.createRequestId();

    try {
      const deviceFlow = await this.authService.initiateDeviceFlow();

      this.liveLogger.authInitiated(deviceFlow.device_code.substring(0, 8));

      const response = {
        verification_uri: deviceFlow.verification_uri,
        user_code: deviceFlow.user_code,
        device_code: deviceFlow.device_code,
        code_verifier: deviceFlow.code_verifier,
      };

      res.json(response);
    } catch (error) {
      this.fileLogger.logError(requestId, 'auth', 500, error);
      this.liveLogger.proxyError(requestId, 500, 'auth', error.message);

      res.status(500).json({
        error: {
          message: error.message,
          type: 'authentication_error',
        },
      });
    }
  }

  async handleAuthPoll(req, res) {
    const requestId = this.createRequestId();

    try {
      const { device_code, code_verifier } = req.body;

      if (!device_code || !code_verifier) {
        const errorResponse = {
          error: {
            message: 'Missing device_code or code_verifier',
            type: 'invalid_request',
          },
        };
        this.fileLogger.logError(requestId, 'auth', 400, 'Missing device_code or code_verifier');
        this.liveLogger.proxyError(requestId, 400, 'auth', 'Missing device_code or code_verifier');
        return res.status(400).json(errorResponse);
      }

      const token = await this.authService.pollForToken(device_code, code_verifier);

      this.liveLogger.authCompleted(device_code.substring(0, 8));

      const accessToken = typeof token === 'string' ? token : token?.access_token;
      const response = {
        access_token: accessToken || token,
        message: 'Authentication successful',
      };

      res.json(response);
    } catch (error) {
      if (error.message.includes('Validation error')) {
        this.liveLogger.proxyError(requestId, 400, 'auth', error.message);
        const validationError = this.ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      this.fileLogger.logError(requestId, 'auth', 500, error);
      this.liveLogger.proxyError(requestId, 500, 'auth', error.message);

      const apiError = this.ErrorFormatter.openAIApiError(error.message, 'authentication_error');
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleWebSearch(req, res) {
    const requestId = this.createRequestId();
    const startTime = Date.now();

    try {
      const { query, page, rows } = req.body;

      if (!query || typeof query !== 'string') {
        this.liveLogger.proxyError(requestId, 400, 'web', 'Query parameter required');
        const validationError = this.ErrorFormatter.openAIValidationError('Query parameter is required and must be a string');
        return res.status(validationError.status).json(validationError.body);
      }

      if (page && (typeof page !== 'number' || page < 1)) {
        this.liveLogger.proxyError(requestId, 400, 'web', 'Page must be positive integer');
        const validationError = this.ErrorFormatter.openAIValidationError('Page must be a positive integer');
        return res.status(validationError.status).json(validationError.body);
      }

      if (rows && (typeof rows !== 'number' || rows < 1 || rows > 100)) {
        this.liveLogger.proxyError(requestId, 400, 'web', 'Rows must be 1-100');
        const validationError = this.ErrorFormatter.openAIValidationError('Rows must be a number between 1 and 100');
        return res.status(validationError.status).json(validationError.body);
      }

      const accountId = req.headers['x-qwen-account'] || req.query.account || req.body.account;
      const displayAccount = accountId ? accountId.substring(0, 8) : 'default';

      this.liveLogger.proxyRequest(requestId, 'web-search', displayAccount, 0);

      const response = await this.qwenAPI.webSearch({
        query,
        page: page || 1,
        rows: rows || 10,
        accountId,
      });

      const latency = Date.now() - startTime;

      this.liveLogger.proxyResponse(requestId, 200, displayAccount, latency, 0, 0);

      res.json(response);
    } catch (error) {
      if (error.message.includes('Validation error')) {
        this.liveLogger.proxyError(requestId, 400, 'web', error.message);
        const validationError = this.ErrorFormatter.openAIValidationError(error.message);
        return res.status(validationError.status).json(validationError.body);
      }

      this.fileLogger.logError(requestId, 'web', 500, error);
      this.liveLogger.proxyError(requestId, 500, 'web', error.message);

      if (error.message.includes('Not authenticated') || error.message.includes('access token')) {
        const authError = this.ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }

      if (error.message.includes('quota') || error.message.includes('exceeded')) {
        const quotaError = {
          error: {
            message: 'Web search quota exceeded. Free accounts have 2000 requests per day.',
            type: 'quota_exceeded',
            code: 'quota_exceeded',
          },
        };
        return res.status(429).json(quotaError);
      }

      const apiError = this.ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }
}

module.exports = {
  QwenOpenAIProxy,
};
