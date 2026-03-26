const express: any = require("express");
const cors: any = require("cors");

const config = require("../config.js") as any;
const { QwenAPI } = require("../qwen/api.js") as any;
const { AccountRefreshScheduler } = require("../utils/accountRefreshScheduler.js") as any;
const { countTokens } = require("../utils/tokenCounter.js") as any;
const { ErrorFormatter } = require("../utils/errorFormatter.js") as any;
const { systemPromptTransformer } = require("../utils/systemPromptTransformer.js") as any;
const liveLogger = require("../utils/liveLogger.js") as any;
const fileLogger = require("../utils/fileLogger.js") as any;
const { mcpGetHandler, mcpPostHandler } = require("../mcp.js") as any;

const { createApiKeyMiddleware } = require("./middleware/api-key.js") as any;
const { QwenOpenAIProxy } = require("./proxy-controller.js") as any;
const { createHealthHandler } = require("./health-handler.js") as any;
const { registerShutdownHandlers, initializeServerRuntime } = require("./lifecycle.js") as any;
const { createTypedCoreServices } = require("./typed-core-bridge.js") as any;

export function createHeadlessAppRuntime(): {
  app: any;
  qwenAPI: any;
  authService: any;
  runtimeConfigStore: any;
  accountRefreshScheduler: any;
} {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.use(cors());

  const qwenAPI = new QwenAPI();
  const accountRefreshScheduler = new AccountRefreshScheduler(qwenAPI);
  const { runtimeConfigStore, authService } = createTypedCoreServices(qwenAPI.authManager);

  const proxy = new QwenOpenAIProxy({
    qwenAPI,
    authService,
    config,
    countTokens,
    ErrorFormatter,
    systemPromptTransformer,
    liveLogger,
    fileLogger,
  });

  const validateApiKey = createApiKeyMiddleware(config);
  app.use("/v1/", validateApiKey);
  app.use("/auth/", validateApiKey);

  app.post("/v1/chat/completions", (req: any, res: any) => {
    void proxy.handleChatCompletion(req, res);
  });
  app.post("/v1/web/search", (req: any, res: any) => {
    void proxy.handleWebSearch(req, res);
  });
  app.get("/v1/models", (req: any, res: any) => {
    void proxy.handleModels(req, res);
  });

  app.post("/auth/initiate", (req: any, res: any) => {
    void proxy.handleAuthInitiate(req, res);
  });
  app.post("/auth/poll", (req: any, res: any) => {
    void proxy.handleAuthPoll(req, res);
  });

  app.get("/mcp", mcpGetHandler);
  app.post("/mcp", mcpPostHandler);
  app.get("/health", createHealthHandler({ qwenAPI, authService }));

  registerShutdownHandlers({ qwenAPI, accountRefreshScheduler, liveLogger });

  return {
    app,
    qwenAPI,
    authService,
    runtimeConfigStore,
    accountRefreshScheduler,
  };
}

export function startHeadlessServer(options: { host?: string; port?: number } = {}): Promise<{ server: any; host: string; port: number }> {
  const host = options.host || config.host;
  const port = options.port || config.port;
  const runtime = createHeadlessAppRuntime();

  return new Promise((resolve, reject) => {
    const server = runtime.app.listen(port, host, async () => {
      try {
        await initializeServerRuntime({
          host,
          port,
          qwenAPI: runtime.qwenAPI,
          authService: runtime.authService,
          runtimeConfigStore: runtime.runtimeConfigStore,
          accountRefreshScheduler: runtime.accountRefreshScheduler,
          liveLogger,
          fileLogger,
          config,
        });
        resolve({ server, host, port });
      } catch (error) {
        server.close(() => reject(error));
      }
    });

    server.on("error", (error: any) => {
      reject(error);
    });
  });
}
