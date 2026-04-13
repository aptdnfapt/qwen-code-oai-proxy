type RequestLike = any;
type ResponseLike = any;

const runtimeActivity = require("../utils/runtimeActivity.js") as typeof import("../utils/runtimeActivity.js");

type ProxyDependencies = {
  qwenAPI: any;
  authService?: any;
  authManager?: any;
  config: any;
  countTokens: (input: unknown) => number;
  ErrorFormatter: any;
  systemPromptTransformer: any;
  liveLogger: any;
  fileLogger: any;
};

function getRequestAccountId(req: RequestLike): string | null {
  const headerValue = req.headers?.["x-qwen-account"];
  if (typeof headerValue === "string" && headerValue) {
    return headerValue;
  }

  if (typeof req.query?.account === "string" && req.query.account) {
    return req.query.account;
  }

  if (typeof req.body?.account === "string" && req.body.account) {
    return req.body.account;
  }

  return null;
}

function resolveThinkingLabel(body: any): string | null {
  if (body.enable_thinking === false) return "think:off";
  if (body.reasoning?.effort) return `think:${body.reasoning.effort}`;
  if (body.enable_thinking === true) {
    return body.thinking_budget ? `think:budget:${body.thinking_budget}` : "think:on";
  }
  return null;
}

const EFFORT_BUDGET_MAP: Record<string, number | null> = {
  low: 1024,
  medium: 8192,
  high: null,
};

function resolveLoggedThinkingParams(body: any): Record<string, any> {
  const result: Record<string, any> = {};

  if (body.enable_thinking !== undefined) {
    result.enable_thinking = body.enable_thinking;
  }

  if (body.thinking_budget !== undefined) {
    result.thinking_budget = body.thinking_budget;
  }

  if (body.reasoning?.effort !== undefined) {
    const effort = body.reasoning.effort;
    if (effort === "none") {
      result.enable_thinking = false;
      delete result.thinking_budget;
    } else if (Object.prototype.hasOwnProperty.call(EFFORT_BUDGET_MAP, effort)) {
      result.enable_thinking = true;
      const mappedBudget = EFFORT_BUDGET_MAP[effort];
      if (mappedBudget !== null) {
        result.thinking_budget = mappedBudget;
      } else {
        delete result.thinking_budget;
      }
    }
  }

  return result;
}

function isAuthLikeError(error: any): boolean {
  const message = error?.message || "";
  return typeof message === "string" && (message.includes("Not authenticated") || message.includes("access token"));
}

function isRateLimitLikeError(error: any): boolean {
  const statusCode = error?.response?.status || error?.status || error?.statusCode;
  if (statusCode === 429) return true;
  const message = error?.message || "";
  return typeof message === "string" && (
    message.toLowerCase().includes("quota") || 
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("429")
  );
}

export class QwenOpenAIProxy {
  qwenAPI: any;
  authService: any;
  config: any;
  countTokens: (input: unknown) => number;
  ErrorFormatter: any;
  systemPromptTransformer: any;
  liveLogger: any;
  fileLogger: any;

  constructor(dependencies: ProxyDependencies) {
    this.qwenAPI = dependencies.qwenAPI;
    this.authService = dependencies.authService || dependencies.authManager || this.qwenAPI.authManager;
    this.config = dependencies.config;
    this.countTokens = dependencies.countTokens;
    this.ErrorFormatter = dependencies.ErrorFormatter;
    this.systemPromptTransformer = dependencies.systemPromptTransformer;
    this.liveLogger = dependencies.liveLogger;
    this.fileLogger = dependencies.fileLogger;
  }

  createRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  buildLoggedUpstreamRequest(req: RequestLike, model: string, transformedMessages: unknown): Record<string, unknown> {
    return {
      model,
      messages: transformedMessages,
      tools: req.body.tools,
      tool_choice: req.body.tool_choice,
      temperature: req.body.temperature || this.config.defaultTemperature,
      max_tokens: req.body.max_tokens || this.config.defaultMaxTokens,
      top_p: req.body.top_p || this.config.defaultTopP,
      top_k: req.body.top_k || this.config.defaultTopK,
      repetition_penalty: req.body.repetition_penalty || this.config.defaultRepetitionPenalty,
      reasoning: req.body.reasoning,
      ...resolveLoggedThinkingParams(req.body),
    };
  }

  logFailedRequestArtifacts(requestId: string, req: RequestLike, model: string, transformedMessages: unknown, statusCode: number, loggingState: any): void {
    const transformedBody = transformedMessages === undefined ? undefined : this.buildLoggedUpstreamRequest(req, model, transformedMessages);
    const logContent = this.fileLogger.formatLogContent(requestId, req, transformedBody, statusCode, 0, undefined);
    this.fileLogger.logToFile(requestId, logContent, statusCode, loggingState);
  }

  async handleChatCompletion(req: RequestLike, res: ResponseLike): Promise<void> {
    const requestId = this.createRequestId();
    const loggingState = this.fileLogger.captureState();
    const accountId = getRequestAccountId(req);
    const model = req.body.model || this.config.defaultModel;
    const startTime = Date.now();
    const displayAccount = accountId ? accountId.substring(0, 8) : "default";
    const requestNum = this.qwenAPI.getRequestCount(accountId || "default");
    const isStreaming = req.body.stream === true;

    try {
      const tokenCount = this.countTokens(req.body.messages);
      const thinkingLabel = resolveThinkingLabel(req.body);
      this.liveLogger.proxyRequest(requestId, model, displayAccount, tokenCount, requestNum, isStreaming, loggingState, thinkingLabel);

      if (isStreaming) {
        await this.handleStreamingChatCompletion(req, res, requestId, accountId, model, startTime, loggingState);
      } else {
        await this.handleRegularChatCompletion(req, res, requestId, accountId, model, startTime, loggingState);
      }
    } catch (error: any) {
      if ((error.message || "").includes("Validation error")) {
        this.logFailedRequestArtifacts(requestId, req, model, undefined, 400, loggingState);
        this.liveLogger.proxyError(requestId, 400, displayAccount, error.message, loggingState);
        const validationError = this.ErrorFormatter.openAIValidationError(error.message);
        res.status(validationError.status).json(validationError.body);
        return;
      }

      this.logFailedRequestArtifacts(requestId, req, model, undefined, 500, loggingState);
      this.fileLogger.logError(requestId, displayAccount, 500, error, undefined, loggingState);
      this.liveLogger.proxyError(requestId, 500, displayAccount, error.message, loggingState);

      if (isAuthLikeError(error)) {
        const authError = this.ErrorFormatter.openAIAuthError();
        res.status(authError.status).json(authError.body);
        return;
      }

      if (isRateLimitLikeError(error)) {
        const rateLimitError = this.ErrorFormatter.openAIRateLimitError(error.message);
        res.status(rateLimitError.status).json(rateLimitError.body);
        return;
      }

      const apiError = this.ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleRegularChatCompletion(req: RequestLike, res: ResponseLike, requestId: string, accountId: string | null, model: string, startTime: number, loggingState: any): Promise<void> {
    const displayAccount = accountId ? accountId.substring(0, 8) : "default";
    let transformedMessages: unknown;

    try {
      transformedMessages = this.systemPromptTransformer.transform(req.body.messages, req.body.model || this.config.defaultModel);
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
        enable_thinking: req.body.enable_thinking,
        thinking_budget: req.body.thinking_budget,
        accountId,
      });

      const latency = Date.now() - startTime;
      const inputTokens = response?.usage?.prompt_tokens || 0;
      const outputTokens = response?.usage?.completion_tokens || 0;
      const qwenId = response?.id ? response.id.replace("chatcmpl-", "").substring(0, 8) : null;

      if (loggingState.isDebugLogging) {
        const logContent = this.fileLogger.formatLogContent(requestId, req, this.buildLoggedUpstreamRequest(req, model, transformedMessages), 200, latency, response);
        this.fileLogger.logToFile(requestId, logContent, 200, loggingState);
      }

      this.liveLogger.proxyResponse(requestId, 200, displayAccount, latency, inputTokens, outputTokens, qwenId, loggingState);
      res.json(response);
    } catch (error: any) {
      const statusCode = error.response?.status || 500;
      this.logFailedRequestArtifacts(requestId, req, model, transformedMessages, statusCode, loggingState);
      this.fileLogger.logError(requestId, displayAccount, statusCode, error, undefined, loggingState);
      this.liveLogger.proxyError(requestId, statusCode, displayAccount, error.message, loggingState);

      if (isAuthLikeError(error)) {
        const authError = this.ErrorFormatter.openAIAuthError();
        res.status(authError.status).json(authError.body);
        return;
      }

      throw error;
    }
  }

  async handleStreamingChatCompletion(req: RequestLike, res: ResponseLike, requestId: string, accountId: string | null, model: string, startTime: number, loggingState: any): Promise<void> {
    const displayAccount = accountId ? accountId.substring(0, 8) : "default";
    let transformedMessages: unknown;

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      transformedMessages = this.systemPromptTransformer.transform(req.body.messages, req.body.model || this.config.defaultModel);
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
        enable_thinking: req.body.enable_thinking,
        thinking_budget: req.body.thinking_budget,
        accountId,
      });

      if (loggingState.isDebugLogging) {
        const logContent = this.fileLogger.formatLogContent(requestId, req, this.buildLoggedUpstreamRequest(req, model, transformedMessages), 200, 0, { streaming: true });
        this.fileLogger.logToFile(requestId, logContent, 200, loggingState);
      }

      let qwenId: string | null = null;
      let buffer = "";
      let streamSettled = false;

      runtimeActivity.incrementActiveStreams();

      const settleStream = (): void => {
        if (streamSettled) {
          return;
        }

        streamSettled = true;
        runtimeActivity.decrementActiveStreams();
      };

      stream.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && !qwenId) {
            const data = line.slice(6);
            if (data !== "[DONE]") {
              try {
                const json = JSON.parse(data) as any;
                if (json.id) {
                  qwenId = json.id.replace("chatcmpl-", "");
                }
              } catch {
              }
            }
          }
        }

        res.write(chunk);
      });

      stream.on("end", () => {
        settleStream();
        const latency = Date.now() - startTime;
        const qwenIdShort = qwenId ? qwenId.substring(0, 8) : null;
        this.liveLogger.proxyResponse(requestId, 200, displayAccount, latency, 0, 0, qwenIdShort, loggingState);
        res.end();
      });

      stream.on("error", (error: any) => {
          settleStream();
          this.logFailedRequestArtifacts(requestId, req, model, transformedMessages, 500, loggingState);
          this.fileLogger.logError(requestId, displayAccount, 500, error, undefined, loggingState);
          this.liveLogger.proxyError(requestId, 500, displayAccount, error.message, loggingState);
        if (!res.headersSent) {
          if (isRateLimitLikeError(error)) {
            const rateLimitError = this.ErrorFormatter.openAIRateLimitError(error.message);
            res.status(rateLimitError.status).json(rateLimitError.body);
          } else {
            const apiError = this.ErrorFormatter.openAIApiError(error.message, "streaming_error");
            res.status(apiError.status).json(apiError.body);
          }
        }
        res.end();
      });

      req.on("close", () => {
        settleStream();
        stream.destroy();
      });
    } catch (error: any) {
      const statusCode = error.response?.status || 500;
      this.logFailedRequestArtifacts(requestId, req, model, transformedMessages, statusCode, loggingState);
      this.fileLogger.logError(requestId, displayAccount, statusCode, error, undefined, loggingState);
      this.liveLogger.proxyError(requestId, statusCode, displayAccount, error.message, loggingState);

      if (isAuthLikeError(error)) {
        const authError = this.ErrorFormatter.openAIAuthError();
        if (!res.headersSent) {
          res.status(authError.status).json(authError.body);
          res.end();
        }
        return;
      }

      if (!res.headersSent) {
        if (isRateLimitLikeError(error)) {
          const rateLimitError = this.ErrorFormatter.openAIRateLimitError(error.message);
          res.status(rateLimitError.status).json(rateLimitError.body);
        } else {
          const apiError = this.ErrorFormatter.openAIApiError(error.message);
          res.status(apiError.status).json(apiError.body);
        }
        res.end();
      }
    }
  }

  async handleModels(_req: RequestLike, res: ResponseLike): Promise<void> {
    const requestId = this.createRequestId();
    const loggingState = this.fileLogger.captureState();
    const startTime = Date.now();

    try {
      const models = await this.qwenAPI.listModels();
      const latency = Date.now() - startTime;
      this.liveLogger.proxyResponse(requestId, 200, "system", latency, 0, 0, undefined, loggingState);
      res.json(models);
    } catch (error: any) {
      this.liveLogger.proxyError(requestId, 500, "system", error.message, loggingState);
      this.fileLogger.logError(requestId, "system", 500, error, undefined, loggingState);

      if (isAuthLikeError(error)) {
        res.status(401).json({
          error: {
            message: "Not authenticated with Qwen. Please authenticate first.",
            type: "authentication_error",
          },
        });
        return;
      }

      res.status(500).json({
        error: {
          message: error.message,
          type: "internal_server_error",
        },
      });
    }
  }

  async handleAuthInitiate(_req: RequestLike, res: ResponseLike): Promise<void> {
    const requestId = this.createRequestId();
    const loggingState = this.fileLogger.captureState();

    try {
      const deviceFlow = await this.authService.initiateDeviceFlow();
      this.liveLogger.authInitiated(deviceFlow.device_code.substring(0, 8));
      res.json({
        verification_uri: deviceFlow.verification_uri,
        user_code: deviceFlow.user_code,
        device_code: deviceFlow.device_code,
        code_verifier: deviceFlow.code_verifier,
      });
    } catch (error: any) {
      this.fileLogger.logError(requestId, "auth", 500, error, undefined, loggingState);
      this.liveLogger.proxyError(requestId, 500, "auth", error.message, loggingState);
      res.status(500).json({
        error: {
          message: error.message,
          type: "authentication_error",
        },
      });
    }
  }

  async handleAuthPoll(req: RequestLike, res: ResponseLike): Promise<void> {
    const requestId = this.createRequestId();
    const loggingState = this.fileLogger.captureState();

    try {
      const { device_code, code_verifier } = req.body;
      if (!device_code || !code_verifier) {
        const errorResponse = {
          error: {
            message: "Missing device_code or code_verifier",
            type: "invalid_request",
          },
        };
        this.fileLogger.logError(requestId, "auth", 400, "Missing device_code or code_verifier", undefined, loggingState);
        this.liveLogger.proxyError(requestId, 400, "auth", "Missing device_code or code_verifier", loggingState);
        res.status(400).json(errorResponse);
        return;
      }

      const token = await this.authService.pollForToken(device_code, code_verifier);
      this.liveLogger.authCompleted(device_code.substring(0, 8));
      const accessToken = typeof token === "string" ? token : token?.access_token;
      res.json({
        access_token: accessToken || token,
        message: "Authentication successful",
      });
    } catch (error: any) {
      if ((error.message || "").includes("Validation error")) {
        this.liveLogger.proxyError(requestId, 400, "auth", error.message, loggingState);
        const validationError = this.ErrorFormatter.openAIValidationError(error.message);
        res.status(validationError.status).json(validationError.body);
        return;
      }

      this.fileLogger.logError(requestId, "auth", 500, error, undefined, loggingState);
      this.liveLogger.proxyError(requestId, 500, "auth", error.message, loggingState);
      if (isRateLimitLikeError(error)) {
        const rateLimitError = this.ErrorFormatter.openAIRateLimitError(error.message);
        res.status(rateLimitError.status).json(rateLimitError.body);
        return;
      }

      const apiError = this.ErrorFormatter.openAIApiError(error.message, "authentication_error");
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleWebSearch(req: RequestLike, res: ResponseLike): Promise<void> {
    const requestId = this.createRequestId();
    const loggingState = this.fileLogger.captureState();
    const startTime = Date.now();

    try {
      const { query, page, rows } = req.body;
      if (!query || typeof query !== "string") {
        this.liveLogger.proxyError(requestId, 400, "web", "Query parameter required", loggingState);
        const validationError = this.ErrorFormatter.openAIValidationError("Query parameter is required and must be a string");
        res.status(validationError.status).json(validationError.body);
        return;
      }

      if (page && (typeof page !== "number" || page < 1)) {
        this.liveLogger.proxyError(requestId, 400, "web", "Page must be positive integer", loggingState);
        const validationError = this.ErrorFormatter.openAIValidationError("Page must be a positive integer");
        res.status(validationError.status).json(validationError.body);
        return;
      }

      if (rows && (typeof rows !== "number" || rows < 1 || rows > 100)) {
        this.liveLogger.proxyError(requestId, 400, "web", "Rows must be 1-100", loggingState);
        const validationError = this.ErrorFormatter.openAIValidationError("Rows must be a number between 1 and 100");
        res.status(validationError.status).json(validationError.body);
        return;
      }

      const accountId = getRequestAccountId(req);
      const displayAccount = accountId ? accountId.substring(0, 8) : "default";
      this.liveLogger.proxyRequest(requestId, "web-search", displayAccount, 0, undefined, undefined, loggingState);

      const response = await this.qwenAPI.webSearch({
        query,
        page: page || 1,
        rows: rows || 10,
        accountId,
      });

      const latency = Date.now() - startTime;
      this.liveLogger.proxyResponse(requestId, 200, displayAccount, latency, 0, 0, undefined, loggingState);
      res.json(response);
    } catch (error: any) {
      if ((error.message || "").includes("Validation error")) {
        this.liveLogger.proxyError(requestId, 400, "web", error.message, loggingState);
        const validationError = this.ErrorFormatter.openAIValidationError(error.message);
        res.status(validationError.status).json(validationError.body);
        return;
      }

      this.fileLogger.logError(requestId, "web", 500, error, undefined, loggingState);
      this.liveLogger.proxyError(requestId, 500, "web", error.message, loggingState);

      if (isAuthLikeError(error)) {
        const authError = this.ErrorFormatter.openAIAuthError();
        res.status(authError.status).json(authError.body);
        return;
      }

      if ((error.message || "").includes("quota") || (error.message || "").includes("exceeded")) {
        res.status(429).json({
          error: {
            message: "Web search quota exceeded. Free accounts have 2000 requests per day.",
            type: "quota_exceeded",
            code: "quota_exceeded",
          },
        });
        return;
      }

      if (isRateLimitLikeError(error)) {
        const rateLimitError = this.ErrorFormatter.openAIRateLimitError(error.message);
        res.status(rateLimitError.status).json(rateLimitError.body);
        return;
      }

      const apiError = this.ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }
}
