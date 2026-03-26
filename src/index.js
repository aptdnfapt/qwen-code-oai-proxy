const express = require("express");
const cors = require("cors");
const config = require("./config.js");
const PORT = config.port;
const HOST = config.host;
const { QwenAPI } = require("./qwen/api.js");
const { QwenAuthManager } = require("./qwen/auth.js");
const { DebugLogger } = require("./utils/logger.js");
const { countTokens } = require("./utils/tokenCounter.js");
const { ErrorFormatter } = require("./utils/errorFormatter.js");
const {
  AccountRefreshScheduler,
} = require("./utils/accountRefreshScheduler.js");
const {
  systemPromptTransformer,
} = require("./utils/systemPromptTransformer.js");
const liveLogger = require("./utils/liveLogger.js");
const fileLogger = require("./utils/fileLogger.js");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cors());

const qwenAPI = new QwenAPI();
const authManager = new QwenAuthManager();
const debugLogger = new DebugLogger();
const accountRefreshScheduler = new AccountRefreshScheduler(qwenAPI);

const validateApiKey = (req, res, next) => {
  if (!config.apiKey) {
    return next();
  }

  const apiKey = req.headers["x-api-key"] || req.headers["authorization"];

  let cleanApiKey = null;
  if (apiKey && typeof apiKey === "string") {
    if (apiKey.startsWith("Bearer ")) {
      cleanApiKey = apiKey.substring(7).trim();
    } else {
      cleanApiKey = apiKey.trim();
    }
  }

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
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const accountId =
      req.headers["x-qwen-account"] || req.query.account || req.body.account;
    const model = req.body.model || config.defaultModel;
    const startTime = Date.now();
    const displayAccount = accountId ? accountId.substring(0, 8) : "default";
    const requestNum = qwenAPI.getRequestCount(accountId || "default");
    const isStreaming = req.body.stream === true;

    try {
      const tokenCount = countTokens(req.body.messages);

      liveLogger.proxyRequest(
        requestId,
        model,
        displayAccount,
        tokenCount,
        requestNum,
        isStreaming,
      );

      if (isStreaming) {
        await this.handleStreamingChatCompletion(
          req,
          res,
          requestId,
          accountId,
          model,
          startTime,
        );
      } else {
        await this.handleRegularChatCompletion(
          req,
          res,
          requestId,
          accountId,
          model,
          startTime,
        );
      }
    } catch (error) {
      if (error.message.includes("Validation error")) {
        liveLogger.proxyError(requestId, 400, displayAccount, error.message);
        const validationError = ErrorFormatter.openAIValidationError(
          error.message,
        );
        return res.status(validationError.status).json(validationError.body);
      }

      fileLogger.logError(requestId, displayAccount, 500, error);

      liveLogger.proxyError(requestId, 500, displayAccount, error.message);

      if (
        error.message.includes("Not authenticated") ||
        error.message.includes("access token")
      ) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }

      const apiError = ErrorFormatter.openAIApiError(error.message);
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleRegularChatCompletion(
    req,
    res,
    requestId,
    accountId,
    model,
    startTime,
  ) {
    const displayAccount = accountId ? accountId.substring(0, 8) : "default";

    try {
      const transformedMessages = systemPromptTransformer.transform(
        req.body.messages,
        req.body.model || config.defaultModel,
      );

      const response = await qwenAPI.chatCompletions({
        model: req.body.model || config.defaultModel,
        messages: transformedMessages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature || config.defaultTemperature,
        max_tokens: req.body.max_tokens || config.defaultMaxTokens,
        top_p: req.body.top_p || config.defaultTopP,
        top_k: req.body.top_k || config.defaultTopK,
        repetition_penalty:
          req.body.repetition_penalty || config.defaultRepetitionPenalty,
        reasoning: req.body.reasoning,
        enable_thinking: req.body.enable_thinking,
        thinking_budget: req.body.thinking_budget,
        accountId: accountId,
      });
      const latency = Date.now() - startTime;
      const inputTokens = response?.usage?.prompt_tokens || 0;
      const outputTokens = response?.usage?.completion_tokens || 0;
      const qwenId = response?.id
        ? response.id.replace("chatcmpl-", "").substring(0, 8)
        : null;

      if (fileLogger.isDebugLogging) {
        const logContent = fileLogger.formatLogContent(
          requestId,
          req,
          { model, messages: transformedMessages },
          200,
          latency,
          response,
        );
        fileLogger.logToFile(requestId, logContent, 200);
      }

      liveLogger.proxyResponse(
        requestId,
        200,
        displayAccount,
        latency,
        inputTokens,
        outputTokens,
        qwenId,
      );

      res.json(response);
    } catch (error) {
      const latency = Date.now() - startTime;
      const statusCode = error.response?.status || 500;

      fileLogger.logError(requestId, displayAccount, statusCode, error);

      liveLogger.proxyError(
        requestId,
        statusCode,
        displayAccount,
        error.message,
      );

      if (
        error.message.includes("Not authenticated") ||
        error.message.includes("access token")
      ) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }

      throw error;
    }
  }

  async handleStreamingChatCompletion(
    req,
    res,
    requestId,
    accountId,
    model,
    startTime,
  ) {
    const displayAccount = accountId ? accountId.substring(0, 8) : "default";

    try {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");

      const transformedMessages = systemPromptTransformer.transform(
        req.body.messages,
        req.body.model || config.defaultModel,
      );

      const stream = await qwenAPI.streamChatCompletions({
        model: req.body.model || config.defaultModel,
        messages: transformedMessages,
        tools: req.body.tools,
        tool_choice: req.body.tool_choice,
        temperature: req.body.temperature || config.defaultTemperature,
        max_tokens: req.body.max_tokens || config.defaultMaxTokens,
        top_p: req.body.top_p || config.defaultTopP,
        top_k: req.body.top_k || config.defaultTopK,
        repetition_penalty:
          req.body.repetition_penalty || config.defaultRepetitionPenalty,
        reasoning: req.body.reasoning,
        enable_thinking: req.body.enable_thinking,
        thinking_budget: req.body.thinking_budget,
        accountId: accountId,
      });

      if (fileLogger.isDebugLogging) {
        const logContent = fileLogger.formatLogContent(
          requestId,
          req,
          { model, messages: transformedMessages },
          200,
          0,
          { streaming: true },
        );
        fileLogger.logToFile(requestId, logContent, 200);
      }

      let qwenId = null;
      let buffer = "";

      stream.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ") && !qwenId) {
            const data = line.slice(6);
            if (data !== "[DONE]") {
              try {
                const json = JSON.parse(data);
                if (json.id) {
                  qwenId = json.id.replace("chatcmpl-", "");
                }
              } catch (e) {}
            }
          }
        }

        res.write(chunk);
      });

      stream.on("end", () => {
        const latency = Date.now() - startTime;
        const qwenIdShort = qwenId ? qwenId.substring(0, 8) : null;
        liveLogger.proxyResponse(
          requestId,
          200,
          displayAccount,
          latency,
          0,
          0,
          qwenIdShort,
        );
        res.end();
      });

      stream.on("error", (error) => {
        fileLogger.logError(requestId, displayAccount, 500, error);
        liveLogger.proxyError(requestId, 500, displayAccount, error.message);
        if (!res.headersSent) {
          const apiError = ErrorFormatter.openAIApiError(
            error.message,
            "streaming_error",
          );
          res.status(apiError.status).json(apiError.body);
        }
        res.end();
      });

      req.on("close", () => {
        stream.destroy();
      });
    } catch (error) {
      const latency = Date.now() - startTime;
      const statusCode = error.response?.status || 500;

      fileLogger.logError(requestId, displayAccount, statusCode, error);

      liveLogger.proxyError(
        requestId,
        statusCode,
        displayAccount,
        error.message,
      );

      if (
        error.message.includes("Not authenticated") ||
        error.message.includes("access token")
      ) {
        const authError = ErrorFormatter.openAIAuthError();
        if (!res.headersSent) {
          res.status(authError.status).json(authError.body);
          res.end();
        }
        return;
      }

      const apiError = ErrorFormatter.openAIApiError(error.message);
      if (!res.headersSent) {
        res.status(apiError.status).json(apiError.body);
        res.end();
      }
    }
  }

  async handleModels(req, res) {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const startTime = Date.now();

    try {
      const models = await qwenAPI.listModels();

      const latency = Date.now() - startTime;
      liveLogger.proxyResponse(requestId, 200, "system", latency, 0, 0);

      res.json(models);
    } catch (error) {
      const latency = Date.now() - startTime;
      liveLogger.proxyError(requestId, 500, "system", error.message);

      fileLogger.logError(requestId, "system", 500, error);

      if (
        error.message.includes("Not authenticated") ||
        error.message.includes("access token")
      ) {
        return res.status(401).json({
          error: {
            message: "Not authenticated with Qwen. Please authenticate first.",
            type: "authentication_error",
          },
        });
      }

      res.status(500).json({
        error: {
          message: error.message,
          type: "internal_server_error",
        },
      });
    }
  }

  async handleAuthInitiate(req, res) {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    try {
      const deviceFlow = await authManager.initiateDeviceFlow();

      liveLogger.authInitiated(deviceFlow.device_code.substring(0, 8));

      const response = {
        verification_uri: deviceFlow.verification_uri,
        user_code: deviceFlow.user_code,
        device_code: deviceFlow.device_code,
        code_verifier: deviceFlow.code_verifier,
      };

      res.json(response);
    } catch (error) {
      fileLogger.logError(requestId, "auth", 500, error);
      liveLogger.proxyError(requestId, 500, "auth", error.message);

      res.status(500).json({
        error: {
          message: error.message,
          type: "authentication_error",
        },
      });
    }
  }

  async handleAuthPoll(req, res) {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    try {
      const { device_code, code_verifier } = req.body;

      if (!device_code || !code_verifier) {
        const errorResponse = {
          error: {
            message: "Missing device_code or code_verifier",
            type: "invalid_request",
          },
        };
        fileLogger.logError(
          requestId,
          "auth",
          400,
          "Missing device_code or code_verifier",
        );
        liveLogger.proxyError(
          requestId,
          400,
          "auth",
          "Missing device_code or code_verifier",
        );
        return res.status(400).json(errorResponse);
      }

      const token = await authManager.pollForToken(device_code, code_verifier);

      liveLogger.authCompleted(device_code.substring(0, 8));

      const response = {
        access_token: token,
        message: "Authentication successful",
      };

      res.json(response);
    } catch (error) {
      if (error.message.includes("Validation error")) {
        liveLogger.proxyError(requestId, 400, "auth", error.message);
        const validationError = ErrorFormatter.openAIValidationError(
          error.message,
        );
        return res.status(validationError.status).json(validationError.body);
      }

      fileLogger.logError(requestId, "auth", 500, error);
      liveLogger.proxyError(requestId, 500, "auth", error.message);

      const apiError = ErrorFormatter.openAIApiError(
        error.message,
        "authentication_error",
      );
      res.status(apiError.status).json(apiError.body);
    }
  }

  async handleWebSearch(req, res) {
    const requestId =
      Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const startTime = Date.now();

    try {
      const { query, page, rows } = req.body;

      if (!query || typeof query !== "string") {
        liveLogger.proxyError(
          requestId,
          400,
          "web",
          "Query parameter required",
        );
        const validationError = ErrorFormatter.openAIValidationError(
          "Query parameter is required and must be a string",
        );
        return res.status(validationError.status).json(validationError.body);
      }

      if (page && (typeof page !== "number" || page < 1)) {
        liveLogger.proxyError(
          requestId,
          400,
          "web",
          "Page must be positive integer",
        );
        const validationError = ErrorFormatter.openAIValidationError(
          "Page must be a positive integer",
        );
        return res.status(validationError.status).json(validationError.body);
      }

      if (rows && (typeof rows !== "number" || rows < 1 || rows > 100)) {
        liveLogger.proxyError(requestId, 400, "web", "Rows must be 1-100");
        const validationError = ErrorFormatter.openAIValidationError(
          "Rows must be a number between 1 and 100",
        );
        return res.status(validationError.status).json(validationError.body);
      }

      const accountId =
        req.headers["x-qwen-account"] || req.query.account || req.body.account;
      const displayAccount = accountId ? accountId.substring(0, 8) : "default";

      liveLogger.proxyRequest(requestId, "web-search", displayAccount, 0);

      const response = await qwenAPI.webSearch({
        query: query,
        page: page || 1,
        rows: rows || 10,
        accountId: accountId,
      });

      const latency = Date.now() - startTime;

      liveLogger.proxyResponse(requestId, 200, displayAccount, latency, 0, 0);

      res.json(response);
    } catch (error) {
      const latency = Date.now() - startTime;

      if (error.message.includes("Validation error")) {
        liveLogger.proxyError(requestId, 400, "web", error.message);
        const validationError = ErrorFormatter.openAIValidationError(
          error.message,
        );
        return res.status(validationError.status).json(validationError.body);
      }

      fileLogger.logError(requestId, "web", 500, error);
      liveLogger.proxyError(requestId, 500, "web", error.message);

      if (
        error.message.includes("Not authenticated") ||
        error.message.includes("access token")
      ) {
        const authError = ErrorFormatter.openAIAuthError();
        return res.status(authError.status).json(authError.body);
      }

      if (
        error.message.includes("quota") ||
        error.message.includes("exceeded")
      ) {
        const quotaError = {
          error: {
            message:
              "Web search quota exceeded. Free accounts have 2000 requests per day.",
            type: "quota_exceeded",
            code: "quota_exceeded",
          },
        };
        return res.status(429).json(quotaError);
      }

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
app.post("/v1/chat/completions", (req, res) =>
  proxy.handleChatCompletion(req, res),
);
app.post("/v1/web/search", (req, res) => proxy.handleWebSearch(req, res));
app.get("/v1/models", (req, res) => proxy.handleModels(req, res));

// Authentication routes
app.post("/auth/initiate", (req, res) => proxy.handleAuthInitiate(req, res));
app.post("/auth/poll", (req, res) => proxy.handleAuthPoll(req, res));

// MCP endpoints
const { mcpGetHandler, mcpPostHandler } = require("./mcp.js");
app.get("/mcp", mcpGetHandler);
app.post("/mcp", mcpPostHandler);

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    await qwenAPI.authManager.loadAllAccounts();
    const defaultCredentials = await qwenAPI.authManager.loadCredentials();
    const accountIds = qwenAPI.authManager.getAccountIds();

    const accounts = [];
    const accountsNeedingRefresh = [];
    let totalRequestsToday = 0;

    if (defaultCredentials) {
      const minutesLeft = (defaultCredentials.expiry_date - Date.now()) / 60000;
      const needsRefresh = qwenAPI.authManager.shouldRefreshToken(
        defaultCredentials,
        null,
      );
      const status =
        minutesLeft < 0
          ? "expired"
          : needsRefresh
            ? "expiring_soon"
            : "healthy";
      const expiresIn = Math.max(0, minutesLeft);
      const requestCount = qwenAPI.getRequestCount("default");
      const webSearchCount = qwenAPI.getWebSearchRequestCount("default");
      totalRequestsToday += requestCount;

      if (needsRefresh) {
        accountsNeedingRefresh.push("default");
      }

      accounts.push({
        id: "default",
        status,
        expiresIn: expiresIn ? `${expiresIn.toFixed(1)} minutes` : null,
        requestCount: requestCount,
        webSearchCount: webSearchCount,
      });
    }

    for (const accountId of accountIds) {
      const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
      let status = "unknown";
      let expiresIn = null;

      if (credentials) {
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
        const needsRefresh = qwenAPI.authManager.shouldRefreshToken(
          credentials,
          accountId,
        );

        if (minutesLeft < 0) {
          status = "expired";
        } else if (needsRefresh) {
          status = "expiring_soon";
        } else {
          status = "healthy";
        }

        if (needsRefresh) {
          accountsNeedingRefresh.push(accountId);
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
      });
    }

    const healthyCount = accounts.filter((a) => a.status === "healthy").length;
    const expiringSoonCount = accounts.filter(
      (a) => a.status === "expiring_soon",
    ).length;
    const expiredCount = accounts.filter((a) => a.status === "expired").length;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const today = new Date().toISOString().split("T")[0];
    for (const [accountId, usageData] of qwenAPI.tokenUsage.entries()) {
      const todayUsage = usageData.find((entry) => entry.date === today);
      if (todayUsage) {
        totalInputTokens += todayUsage.inputTokens;
        totalOutputTokens += todayUsage.outputTokens;
      }
    }

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      summary: {
        total: accounts.length,
        healthy: healthyCount,
        expiring_soon: expiringSoonCount,
        expired: expiredCount,
        total_requests_today: totalRequestsToday,
        lastReset: qwenAPI.lastResetDate,
      },
      token_usage: {
        input_tokens_today: totalInputTokens,
        output_tokens_today: totalOutputTokens,
        total_tokens_today: totalInputTokens + totalOutputTokens,
      },
      accounts,
      health: {
        rotation: "round_robin",
        persistentCooldowns: false,
        preemptiveRefreshWindowMinutes: "10-30",
        accountsNeedingRefresh,
      },
      server_info: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      endpoints: {
        openai: `${req.protocol}://${req.get("host")}/v1`,
        health: `${req.protocol}://${req.get("host")}/health`,
      },
    });
  } catch (error) {
    console.error("Health check error:", error.message);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: error.message,
      server_info: {
        uptime: process.uptime(),
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });
  }
});

// Handle graceful shutdown to save pending data
process.on("SIGINT", async () => {
  liveLogger.shutdown("SIGINT received");
  try {
    accountRefreshScheduler.stopScheduler();
    liveLogger.accountRemoved("refresh-scheduler");
  } catch (error) {
    console.error("Failed to stop scheduler:", error.message);
  }

  try {
    await qwenAPI.saveRequestCounts();
  } catch (error) {
    console.error("Failed to save request counts:", error.message);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  liveLogger.shutdown("SIGTERM received");
  try {
    accountRefreshScheduler.stopScheduler();
    liveLogger.accountRemoved("refresh-scheduler");
  } catch (error) {
    console.error("Failed to stop scheduler:", error.message);
  }

  try {
    await qwenAPI.saveRequestCounts();
  } catch (error) {
    console.error("Failed to save request counts:", error.message);
  }
  process.exit(0);
});

app.listen(PORT, HOST, async () => {
  liveLogger.serverStarted(HOST, PORT);

  qwenAPI.authManager.init(qwenAPI);
  fileLogger.startCleanupJob();

  try {
    await qwenAPI.authManager.loadAllAccounts();
    const accountIds = qwenAPI.authManager.getAccountIds();

    const defaultAccount = config.defaultAccount;
    if (defaultAccount) {
      console.log(`\x1b[36mDefault account: ${defaultAccount}\x1b[0m`);
    }

    if (accountIds.length > 0) {
      console.log("\x1b[36mAccounts:\x1b[0m");
      for (const accountId of accountIds) {
        const credentials =
          qwenAPI.authManager.getAccountCredentials(accountId);
        const isValid =
          credentials && qwenAPI.authManager.isTokenValid(credentials);
        const status = isValid
          ? "\x1b[32mvalid\x1b[0m"
          : "\x1b[31minvalid\x1b[0m";
        const isDefault = accountId === defaultAccount ? " (default)" : "";
        console.log(`  ${accountId}${isDefault}: ${status}`);
      }
    } else {
      const defaultCredentials = await qwenAPI.authManager.loadCredentials();
      if (defaultCredentials) {
        const isValid = qwenAPI.authManager.isTokenValid(defaultCredentials);
        const status = isValid
          ? "\x1b[32mvalid\x1b[0m"
          : "\x1b[31minvalid\x1b[0m";
        console.log(`\x1b[36mDefault account: ${status}\x1b[0m`);
      } else {
        console.log("\x1b[33mNo accounts configured\x1b[0m");
      }
    }
  } catch (error) {
    console.log("\x1b[33mWarning: Could not load accounts\x1b[0m");
  }

  try {
    await accountRefreshScheduler.initialize();
  } catch (error) {
    console.log(`\x1b[31mScheduler init failed: ${error.message}\x1b[0m`);
  }
});
