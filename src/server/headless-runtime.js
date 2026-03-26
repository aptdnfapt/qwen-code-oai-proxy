const express = require('express');
const cors = require('cors');

const config = require('../config.js');
const { QwenAPI } = require('../qwen/api.js');
const { AccountRefreshScheduler } = require('../utils/accountRefreshScheduler.js');
const { countTokens } = require('../utils/tokenCounter.js');
const { ErrorFormatter } = require('../utils/errorFormatter.js');
const { systemPromptTransformer } = require('../utils/systemPromptTransformer.js');
const liveLogger = require('../utils/liveLogger.js');
const fileLogger = require('../utils/fileLogger.js');
const { mcpGetHandler, mcpPostHandler } = require('../mcp.js');

const { createApiKeyMiddleware } = require('./middleware/api-key.js');
const { QwenOpenAIProxy } = require('./proxy-controller.js');
const { createHealthHandler } = require('./health-handler.js');
const { registerShutdownHandlers, initializeServerRuntime } = require('./lifecycle.js');
const { createTypedCoreServices } = require('./typed-core-bridge.js');

function createHeadlessAppRuntime() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
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

  app.use('/v1/', validateApiKey);
  app.use('/auth/', validateApiKey);

  app.post('/v1/chat/completions', (req, res) => proxy.handleChatCompletion(req, res));
  app.post('/v1/web/search', (req, res) => proxy.handleWebSearch(req, res));
  app.get('/v1/models', (req, res) => proxy.handleModels(req, res));

  app.post('/auth/initiate', (req, res) => proxy.handleAuthInitiate(req, res));
  app.post('/auth/poll', (req, res) => proxy.handleAuthPoll(req, res));

  app.get('/mcp', mcpGetHandler);
  app.post('/mcp', mcpPostHandler);

  app.get('/health', createHealthHandler({ qwenAPI, authService }));

  registerShutdownHandlers({ qwenAPI, accountRefreshScheduler, liveLogger });

  return {
    app,
    qwenAPI,
    authService,
    runtimeConfigStore,
    accountRefreshScheduler,
  };
}

function startHeadlessServer(options = {}) {
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

    server.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = {
  createHeadlessAppRuntime,
  startHeadlessServer,
};
