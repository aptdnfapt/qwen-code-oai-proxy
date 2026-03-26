require("dotenv").config();

const fs = require("node:fs") as typeof import("node:fs");

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseFloatValue(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isNaN(parsed) ? fallback : parsed;
}

function loadSystemPrompt(): string | null {
  if (!process.env.SYSTEM_PROMPT_FILE) {
    return null;
  }

  return fs.readFileSync(process.env.SYSTEM_PROMPT_FILE, "utf8");
}

const config = {
  port: parseInteger(process.env.PORT, 8080),
  host: process.env.HOST || "localhost",
  stream: process.env.STREAM === "true",
  qwen: {
    clientId: process.env.QWEN_CLIENT_ID || "f0304373b74a44d2b584a3fb70ca9e56",
    clientSecret: process.env.QWEN_CLIENT_SECRET || "",
    baseUrl: process.env.QWEN_BASE_URL || "https://chat.qwen.ai",
    deviceCodeEndpoint: process.env.QWEN_DEVICE_CODE_ENDPOINT || "https://chat.qwen.ai/api/v1/oauth2/device/code",
    tokenEndpoint: process.env.QWEN_TOKEN_ENDPOINT || "https://chat.qwen.ai/api/v1/oauth2/token",
    scope: process.env.QWEN_SCOPE || "openid profile email model.completion",
  },
  defaultModel: process.env.DEFAULT_MODEL || "qwen3-coder-plus",
  defaultTemperature: parseFloatValue(process.env.DEFAULT_TEMPERATURE, 0.7),
  defaultMaxTokens: parseInteger(process.env.DEFAULT_MAX_TOKENS, 65536),
  defaultTopP: parseFloatValue(process.env.DEFAULT_TOP_P, 0.8),
  defaultTopK: parseInteger(process.env.DEFAULT_TOP_K, 20),
  defaultRepetitionPenalty: parseFloatValue(process.env.DEFAULT_REPETITION_PENALTY, 1.05),
  tokenRefreshBuffer: parseInteger(process.env.TOKEN_REFRESH_BUFFER, 30000),
  defaultAccount: process.env.DEFAULT_ACCOUNT || "",
  qwenCodeAuthUse: process.env.QWEN_CODE_AUTH_USE !== "false",
  maxRetries: parseInteger(process.env.MAX_RETRIES || "5", 5),
  retryDelayMs: parseInteger(process.env.RETRY_DELAY_MS || "1000", 1000),
  apiKey: process.env.API_KEY
    ? process.env.API_KEY.split(",").map((key) => key.trim()).filter((key) => key.length > 0)
    : null,
  systemPrompt: {
    enabled: process.env.SYSTEM_PROMPT_ENABLED !== "false",
    prompt: loadSystemPrompt(),
    appendMode: process.env.SYSTEM_PROMPT_MODE || "prepend",
    modelFilter: process.env.SYSTEM_PROMPT_MODELS
      ? process.env.SYSTEM_PROMPT_MODELS.split(",").map((model) => model.trim())
      : null,
  },
  debugLog: String(process.env.DEBUG_LOG || "").toLowerCase() === "true" || String(process.env.LOG_LEVEL || "").toLowerCase() === "debug",
  logFileLimit: parseInteger(process.env.MAX_DEBUG_LOGS || process.env.LOG_FILE_LIMIT, 20),
};

export = config;
