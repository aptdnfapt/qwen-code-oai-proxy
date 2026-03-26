const express = require('express');
const cors = require('cors');

const config = require('./config.js');
const { QwenAPI } = require('./qwen/api.js');
const { AccountRefreshScheduler } = require('./utils/accountRefreshScheduler.js');
const { countTokens } = require('./utils/tokenCounter.js');
const { ErrorFormatter } = require('./utils/errorFormatter.js');
const { systemPromptTransformer } = require('./utils/systemPromptTransformer.js');
const liveLogger = require('./utils/liveLogger.js');
const fileLogger = require('./utils/fileLogger.js');
const { mcpGetHandler, mcpPostHandler } = require('./mcp.js');

const { createApiKeyMiddleware } = require('./server/middleware/api-key.js');
const { QwenOpenAIProxy } = require('./server/proxy-controller.js');
const { createHealthHandler } = require('./server/health-handler.js');
const { registerShutdownHandlers, initializeServerRuntime } = require('./server/lifecycle.js');
const { createTypedCoreServices } = require('./server/typed-core-bridge.js');

const PORT = config.port;
const HOST = config.host;

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

app.listen(PORT, HOST, async () => {
  await initializeServerRuntime({
    host: HOST,
    port: PORT,
    qwenAPI,
    authService,
    runtimeConfigStore,
    accountRefreshScheduler,
    liveLogger,
    fileLogger,
    config,
  });
});
