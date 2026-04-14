const axios: any = require("axios");
const http = require("node:http") as typeof import("node:http");
const https = require("node:https") as typeof import("node:https");
const { QwenAuthManager } = require("./auth.js") as any;
const { PassThrough } = require("node:stream") as typeof import("node:stream");
const path = require("node:path") as typeof import("node:path");
const { promises: fs } = require("node:fs") as typeof import("node:fs");
const usageStore = require("../utils/usageStore.js") as typeof import("../utils/usageStore.js");

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000,
} as any);

const DEFAULT_QWEN_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3-coder-plus";
const MODEL_ALIASES: Record<string, string> = {
  "qwen3.5-plus": "coder-model",
  "qwen3.6-plus": "coder-model",
};

const MODEL_LIMITS: Record<string, { maxTokens: number }> = {
  "vision-model": { maxTokens: 32768 },
  "qwen3-vl-plus": { maxTokens: 32768 },
  "qwen3-vl-max": { maxTokens: 32768 },
  "qwen3.5-plus": { maxTokens: 65536 },
  "qwen3.6-plus": { maxTokens: 65536 },
  "coder-model": { maxTokens: 65536 },
};

const QWEN_MODELS = [
  { id: "qwen3-coder-plus", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "qwen3-coder-flash", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "qwen3.5-plus", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "qwen3.6-plus", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "coder-model", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "vision-model", object: "model", created: 1754686206, owned_by: "qwen" },
];

const EFFORT_BUDGET_MAP: Record<string, number | null> = {
  low: 1024,
  medium: 8192,
  high: null,
};

function resolveThinkingParams(request: any): Record<string, any> {
  const result: Record<string, any> = {};

  if (request.enable_thinking !== undefined) {
    result.enable_thinking = request.enable_thinking;
  }
  if (request.thinking_budget !== undefined) {
    result.thinking_budget = request.thinking_budget;
  }

  if (request.reasoning?.effort !== undefined) {
    const effort = request.reasoning.effort;
    if (effort === "none") {
      result.enable_thinking = false;
    } else if (Object.prototype.hasOwnProperty.call(EFFORT_BUDGET_MAP, effort)) {
      result.enable_thinking = true;
      if (EFFORT_BUDGET_MAP[effort] !== null) {
        result.thinking_budget = EFFORT_BUDGET_MAP[effort];
      }
    }
  }

  return result;
}

type RequestUsageEntry = {
  date: string;
  requests: number;
  requestsKnown: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheTypes: string[];
};

type AccountInfo = {
  accountId: string;
  credentials: any;
};

function resolveModelAlias(model: string): string {
  return MODEL_ALIASES[model] || model;
}

function buildDashScopeHeaders(accessToken: string, isStreaming = false): Record<string, string> {
  const headers: Record<string, string> = {
    connection: "keep-alive",
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "user-agent": "QwenCode/0.14.3 (linux; x64)",
    "x-dashscope-authtype": "qwen-oauth",
    "x-dashscope-cachecontrol": "enable",
    "x-dashscope-useragent": "QwenCode/0.14.3 (linux; x64)",
    "x-stainless-arch": "x64",
    "x-stainless-lang": "js",
    "x-stainless-os": "Linux",
    "x-stainless-package-version": "5.11.0",
    "x-stainless-retry-count": "1",
    "x-stainless-runtime": "node",
    "x-stainless-runtime-version": "v18.19.1",
    "accept-language": "*",
    "sec-fetch-mode": "cors",
  };

  if (isStreaming) {
    headers.accept = "text/event-stream";
  }

  return headers;
}

function clampMaxTokens(model: string, maxTokens: number): number {
  const limit = MODEL_LIMITS[model];
  if (limit && maxTokens > limit.maxTokens) {
    return limit.maxTokens;
  }
  return maxTokens;
}

function processMessagesForVision(messages: any[], model: string): any[] {
  if (model !== "vision-model") {
    return messages;
  }

  return messages.map((message) => {
    if (!message.content) {
      return message;
    }

    if (Array.isArray(message.content)) {
      return message;
    }

    if (typeof message.content === "string") {
      let hasImages = false;
      const content = message.content;
      const parts: any[] = [{ type: "text", text: content }];

      const base64Matches = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g);
      if (base64Matches) {
        hasImages = true;
        base64Matches.forEach((match: string) => {
          parts.push({
            type: "image_url",
            image_url: { url: match },
          });
        });
      }

      const urlMatches = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|bmp)/gi);
      if (urlMatches) {
        hasImages = true;
        urlMatches.forEach((url: string) => {
          parts.push({
            type: "image_url",
            image_url: { url },
          });
        });
      }

      if (!hasImages) {
        return message;
      }

      return {
        ...message,
        content: parts,
      };
    }

    return message;
  });
}

/**
 * Sanitizes and transforms message payloads to comply with the undocumented 
 * strict formatting rules of the `portal.qwen.ai/v1/chat/completions` endpoint.
 * 
 * Context: 
 * The proprietary Qwen frontend gateway expects a highly specific mismatch of formats:
 * 1. `system` role messages MUST be formatted as an array containing `cache_control`.
 * 2. `user` role messages MUST be flat strings. Array-wrapped user messages 
 *    (e.g., from Anthropic/Claude Code) will trigger a strict HTTP 400 Bad Request.
 * 
 * @param messages - The original array of messages from the client request
 * @returns A transformed array of messages safe for the Qwen upstream
 */
function transformMessagesForPortal(messages: any[]): any[] {
  return messages.map((message, index) => {
    if (!message.content) {
      return message;
    }

    // Fix 1: Wrap system strings into cache-controlled arrays.
    // Without this, portal.qwen.ai rejects the payload with HTTP 400.
    if (message.role === "system" && typeof message.content === "string") {
      return {
        ...message,
        content: [
          {
            type: "text",
            text: message.content,
            cache_control: { type: "ephemeral" },
          },
        ],
      };
    }

    // Fix 2: Flatten complex user content arrays back into simple strings.
    // Clients like Claude Code Router send user messages as Anthropic-style blocks 
    // [{type: "text", text: "..."}], but the Qwen portal strictly requires flat strings.
    if (message.role === "user" && Array.isArray(message.content)) {
      let flattenedText = "";
      for (const part of message.content) {
        if (part.type === "text" && typeof part.text === "string") {
          flattenedText += part.text;
        } else if (typeof part === "string") {
          flattenedText += part;
        }
      }
      return {
        ...message,
        content: flattenedText || " "
      };
    }

    return message;
  });
}

function isHardQuotaError(error: any): boolean {
  // Detects 429 insufficient_quota that is a HARD limit (not transient rate limit).
  // These should NOT be retried on the same account.
  const statusCode = error?.response?.status || error?.status || error?.statusCode;
  const errorCode = error?.code || error?.response?.data?.error?.code;
  const errorMessage = (
    error?.message || error?.response?.data?.error?.message || ""
  ).toLowerCase();

  if (statusCode === 429 && errorCode === "insufficient_quota") {
    return true;
  }

  // Also catch quota errors embedded in response body text
  if (
    statusCode === 429 &&
    (errorMessage.includes("free allocated quota exceeded") ||
      errorMessage.includes("exceeded your current quota") ||
      (errorMessage.includes("quota") && errorMessage.includes("exceeded")))
  ) {
    return true;
  }

  return false;
}

function isAuthError(error: any): boolean {
  if (!error) {
    return false;
  }

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const errorCode = error?.response?.status || error?.status || error?.statusCode;

  return (
    errorCode === 401 ||
    errorCode === 403 ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("forbidden") ||
    errorMessage.includes("invalid api key") ||
    errorMessage.includes("invalid access token") ||
    errorMessage.includes("token expired") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("access denied") ||
    errorMessage.includes("not authenticated") ||
    (errorMessage.includes("token") && errorMessage.includes("expired"))
  );
}

function isClientRequestError(error: any): boolean {
  if (!error) {
    return false;
  }

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const statusCode = error?.response?.status || error?.status || error?.statusCode;

  return (
    statusCode === 400 ||
    statusCode === 404 ||
    statusCode === 409 ||
    statusCode === 413 ||
    statusCode === 422 ||
    errorMessage.includes("validation error") ||
    errorMessage.includes("invalid json") ||
    errorMessage.includes("unexpected token") ||
    errorMessage.includes("context length") ||
    errorMessage.includes("maximum context length") ||
    errorMessage.includes("unsupported parameter") ||
    errorMessage.includes("unsupported value") ||
    errorMessage.includes("invalid_request_error")
  );
}

function isRetryableRequestError(error: any): boolean {
  if (!error) {
    return false;
  }

  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const statusCode = error?.response?.status || error?.status || error?.statusCode;
  const errorCode = error?.code;

  if (statusCode === 429 || statusCode >= 500) {
    return true;
  }

  return (
    errorCode === "ECONNABORTED" ||
    errorCode === "ECONNRESET" ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "EAI_AGAIN" ||
    errorCode === "ECONNREFUSED" ||
    errorMessage.includes("timeout") ||
    errorMessage.includes("socket hang up") ||
    errorMessage.includes("network error") ||
    errorMessage.includes("gateway timeout") ||
    errorMessage.includes("free allocated quota exceeded") ||
    errorMessage.includes("insufficient_quota") ||
    (errorMessage.includes("quota") && errorMessage.includes("exceeded"))
  );
}

function classifyRequestError(error: any): "auth" | "client" | "retryable" | "quota" {
  if (isAuthError(error)) {
    return "auth";
  }

  // Hard quota exceeded — don't retry same account
  if (isHardQuotaError(error)) {
    return "quota";
  }

  if (isClientRequestError(error)) {
    return "client";
  }

  if (isRetryableRequestError(error)) {
    return "retryable";
  }

  const statusCode = error?.response?.status || error?.status || error?.statusCode;
  if (statusCode >= 400 && statusCode < 500) {
    return "client";
  }

  return "retryable";
}

function isReadableStream(value: any): boolean {
  return Boolean(value && typeof value.on === "function" && typeof value.pipe === "function");
}

function normalizeRawResponseBody(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function readErrorResponseStream(stream: any): Promise<string> {
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];

    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    });

    stream.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    stream.on("error", (error: any) => {
      resolve(`[failed to read upstream error stream: ${error.message}]`);
    });
  });
}

async function attachUpstreamErrorDetails(error: any): Promise<any> {
  if (!error || !error.response) {
    return error;
  }

  let responseData = error.response.data;
  if (isReadableStream(responseData)) {
    responseData = await readErrorResponseStream(responseData);
  }

  error.upstreamErrorDetails = {
    status: error.response.status,
    statusText: error.response.statusText,
    rawBody: normalizeRawResponseBody(responseData),
  };

  return error;
}

function parseJsonResponseBody(rawBody: unknown, context: string): any {
  const normalizedBody = normalizeRawResponseBody(rawBody);
  try {
    return JSON.parse(normalizedBody);
  } catch (error: any) {
    throw new Error(`Invalid JSON response from ${context}: ${error.message}. Raw response: ${normalizedBody}`);
  }
}

function asNonNegativeNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return num;
}

function resolveCacheWriteTokens(details: any): number {
  const directValue = asNonNegativeNumber(details?.cache_creation_input_tokens);
  if (directValue > 0) {
    return directValue;
  }

  const buckets = details?.cache_creation;
  if (!buckets || typeof buckets !== "object") {
    return 0;
  }

  return Object.values(buckets as Record<string, unknown>).reduce<number>(
    (total, value) => total + asNonNegativeNumber(value),
    0,
  );
}

function resolveCacheType(details: any): string | null {
  if (typeof details?.cache_type === "string" && details.cache_type.trim().length > 0) {
    return details.cache_type.trim();
  }

  const buckets = details?.cache_creation;
  if (!buckets || typeof buckets !== "object") {
    return null;
  }

  const bucketKeys = Object.entries(buckets)
    .filter(([, value]) => asNonNegativeNumber(value) > 0)
    .map(([key]) => key.replace(/_input_tokens$/, ""));

  if (bucketKeys.length === 0) {
    return null;
  }

  if (bucketKeys.length === 1) {
    return bucketKeys[0];
  }

  return "mixed";
}

function extractUsageMetrics(usage: any): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheType: string | null;
} {
  const details = usage?.prompt_tokens_details;
  return {
    inputTokens: asNonNegativeNumber(usage?.prompt_tokens),
    outputTokens: asNonNegativeNumber(usage?.completion_tokens),
    cacheReadTokens: asNonNegativeNumber(details?.cached_tokens),
    cacheWriteTokens: resolveCacheWriteTokens(details),
    cacheType: resolveCacheType(details),
  };
}

export function extractUsageFromSseText(
  buffer: string,
  latestUsage: any,
): { buffer: string; latestUsage: any } {
  const lines = buffer.split("\n");
  const remainder = lines.pop() || "";
  let nextLatestUsage = latestUsage;

  for (const line of lines) {
    if (!line.startsWith("data: ")) {
      continue;
    }

    const payloadLine = line.slice(6);
    if (payloadLine === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(payloadLine) as any;
      if (parsed?.usage) {
        nextLatestUsage = parsed.usage;
      }
    } catch {
    }
  }

  return {
    buffer: remainder,
    latestUsage: nextLatestUsage,
  };
}

export class QwenAPI {
  authManager: any;
  requestCount: Map<string, number>;
  tokenUsage: Map<string, RequestUsageEntry[]>;
  lastResetDate: string;

  webSearchRequestCounts: Map<string, number>;
  webSearchResultCounts: Map<string, number>;
  private storeReady: Promise<void>;
  private storeInitialized: boolean;
  constructor() {
    this.authManager = new QwenAuthManager();
    this.requestCount = new Map();
    this.tokenUsage = new Map();
    this.lastResetDate = new Date().toISOString().split("T")[0] as string;

    this.webSearchRequestCounts = new Map();
    this.webSearchResultCounts = new Map();
    this.storeInitialized = false;
    this.storeReady = usageStore.openUsageStore().then(() => {
      this.storeInitialized = true;
      this.loadUsageStateFromStore();
    });
  }

  private async ensureUsageStoreReady(): Promise<void> {
    await this.storeReady;
  }

  private loadUsageStateFromStore(): void {
    this.lastResetDate = usageStore.getLastResetDate();
    this.resetRequestCountsIfNeeded();
    this.requestCount = usageStore.getAllTodayRequestCounts(this.lastResetDate);
    const allUsage = usageStore.getAllUsage();
    this.tokenUsage = new Map(
      Array.from(allUsage.entries()).map(([accountId, entries]) => [
        accountId,
        entries.map((e) => ({
          date: e.date,
          requests: e.requests,
          requestsKnown: e.requestsKnown,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          cacheReadTokens: e.cacheReadTokens,
          cacheWriteTokens: e.cacheWriteTokens,
          cacheTypes: e.cacheTypes,
        })),
      ]),
    );
  }

  async loadRequestCounts(): Promise<void> {
    await this.ensureUsageStoreReady();
    this.loadUsageStateFromStore();
  }

  async saveRequestCounts(): Promise<void> {
    await this.ensureUsageStoreReady();
    usageStore.closeUsageStore();
  }

  resetRequestCountsIfNeeded(): void {
    if (!this.storeInitialized) {
      return;
    }

    const today = new Date().toISOString().split("T")[0] as string;
    if (today !== this.lastResetDate) {
      usageStore.resetRequestCounts(today);
      this.requestCount.clear();
      this.webSearchRequestCounts.clear();
      this.webSearchResultCounts.clear();
      this.lastResetDate = today;
      console.log("Request counts reset for new UTC day");
    }
  }

  async incrementWebSearchRequestCount(accountId: string): Promise<void> {
    await this.ensureUsageStoreReady();
    usageStore.incrementWebSearchRequest(accountId);
    const currentCount = this.webSearchRequestCounts.get(accountId) || 0;
    this.webSearchRequestCounts.set(accountId, currentCount + 1);
  }

  getWebSearchRequestCount(accountId: string): number {
    return this.webSearchRequestCounts.get(accountId) || 0;
  }

  async incrementWebSearchResultCount(accountId: string, resultCount: number): Promise<void> {
    await this.ensureUsageStoreReady();
    usageStore.incrementWebSearchResults(accountId, resultCount);
    const currentCount = this.webSearchResultCounts.get(accountId) || 0;
    this.webSearchResultCounts.set(accountId, currentCount + resultCount);
  }

  getWebSearchResultCount(accountId: string): number {
    return this.webSearchResultCounts.get(accountId) || 0;
  }

  async incrementRequestCount(accountId: string): Promise<void> {
    await this.ensureUsageStoreReady();
    this.resetRequestCountsIfNeeded();
    const today = this.lastResetDate;
    usageStore.incrementRequestCount(accountId, today);
    usageStore.incrementUsageRequests(accountId, today);
    const currentCount = this.requestCount.get(accountId) || 0;
    this.requestCount.set(accountId, currentCount + 1);
  }

  async recordTokenUsage(accountId: string, usage: any): Promise<void> {
    try {
      await this.ensureUsageStoreReady();
      const today = new Date().toISOString().split("T")[0] as string;
      const metrics = extractUsageMetrics(usage);
      usageStore.recordTokenUsage(
        accountId,
        today,
        metrics.inputTokens,
        metrics.outputTokens,
        metrics.cacheReadTokens,
        metrics.cacheWriteTokens,
        metrics.cacheType,
      );
    } catch (error: any) {
      console.warn("Failed to record token usage:", error.message);
    }
  }

  getRequestCount(accountId: string): number {
    this.resetRequestCountsIfNeeded();
    return this.requestCount.get(accountId) || 0;
  }

  normalizeAccountId(accountId: string | null | undefined): string {
    return accountId || "default";
  }

  async loadCredentialsForAccount(accountId: string): Promise<any> {
    if (accountId === "default") {
      return await this.authManager.loadCredentials();
    }

    return this.authManager.getAccountCredentials(accountId);
  }

  async refreshCredentialsForAccount(accountId: string, credentials: any): Promise<any> {
    return await this.authManager.refreshCredentialsIfNeeded(credentials, accountId === "default" ? null : accountId);
  }

  async prepareAccountCandidate(accountId: string): Promise<AccountInfo | null> {
    let credentials = await this.loadCredentialsForAccount(accountId);
    if (!credentials) {
      return null;
    }

    if (this.authManager.shouldRefreshToken(credentials, accountId === "default" ? null : accountId)) {
      const minutesLeft = ((credentials.expiry_date || 0) - Date.now()) / 60000;
      console.log(`\x1b[33mAccount ${accountId} needs refresh before request (${minutesLeft.toFixed(0)}m left)\x1b[0m`);
      credentials = await this.refreshCredentialsForAccount(accountId, credentials);
      console.log(`\x1b[32mAccount ${accountId} refreshed successfully\x1b[0m`);
    }

    return { accountId, credentials };
  }

  getRotationOrder(accountIds: string[]): string[] {
    if (accountIds.length <= 1) {
      return [...accountIds];
    }

    const startIndex = this.authManager.currentAccountIndex % accountIds.length;
    this.authManager.currentAccountIndex = (startIndex + 1) % accountIds.length;
    return accountIds.slice(startIndex).concat(accountIds.slice(0, startIndex));
  }

  async executeOperationWithAccount(
    accountInfo: AccountInfo,
    executeAttempt: (accountInfo: AccountInfo) => Promise<any>,
    retryConfig?: { maxRetries: number; backoffMs: number },
  ): Promise<any> {
    const maxRetries = retryConfig?.maxRetries ?? 0;
    const backoffMs = retryConfig?.backoffMs ?? 1000;

    // First attempt + optional retries on same account
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await executeAttempt(accountInfo);
      } catch (error: any) {
        lastError = error;
        const errorType = classifyRequestError(error);

        // Auth error → try refresh once, then give up on this account
        if (errorType === "auth") {
          console.log(`\x1b[33mAuth error for ${accountInfo.accountId}, attempting refresh...\x1b[0m`);
          let refreshedCredentials: any;
          try {
            refreshedCredentials = await this.authManager.refreshCredentialsIfNeeded(
              accountInfo.credentials,
              accountInfo.accountId === "default" ? null : accountInfo.accountId,
              { force: true },
            );
          } catch (refreshError) {
            throw { error: refreshError, rotate: true };
          }

          try {
            return await executeAttempt({ ...accountInfo, credentials: refreshedCredentials });
          } catch (retryError: any) {
            const retryErrorType = classifyRequestError(retryError);
            throw { error: retryError, rotate: retryErrorType !== "client" };
          }
        }

        // Hard quota → always rotate to next account
        if (errorType === "quota") {
          throw { error, rotate: true };
        }

        // Client error → don't retry, don't rotate
        if (errorType === "client") {
          throw { error, rotate: false };
        }

        // Retryable (429 rate limit, 5xx, network) → retry same account if attempts left
        if (attempt < maxRetries) {
          const delay = backoffMs * (attempt + 1); // linear backoff
          const liveLogger = require("../utils/liveLogger.js");
          liveLogger.proxyRetry(
            "per-account",
            accountInfo.accountId,
            attempt + 1,
            maxRetries,
            delay,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Exhausted per-account retries → rotate
        const liveLogger = require("../utils/liveLogger.js");
        liveLogger.proxyRetryFailed(
          "per-account",
          accountInfo.accountId,
          attempt + 1,
          maxRetries,
        );
        throw { error, rotate: true };
      }
    }

    throw { error: lastError, rotate: true };
  }

  async executeWithAccountRotation(
    accountIds: string[],
    executeAttempt: (accountInfo: AccountInfo) => Promise<any>,
    onSuccess: (accountId: string, result: any) => Promise<void>,
    retryConfig?: { maxRetries: number; backoffMs: number },
  ): Promise<any> {
    let lastError: any = null;
    const rotationOrder = this.getRotationOrder(accountIds);

    for (const accountId of rotationOrder) {
      let candidate: AccountInfo | null;
      try {
        candidate = await this.prepareAccountCandidate(accountId);
      } catch (prepareError) {
        lastError = prepareError;
        continue;
      }

      if (!candidate) {
        continue;
      }

      try {
        const result = await this.executeOperationWithAccount(candidate, executeAttempt, retryConfig);
        await onSuccess(candidate.accountId, result);
        return result;
      } catch (outcome: any) {
        lastError = outcome.error || outcome;

        // Log quota exceeded
        if (classifyRequestError(lastError) === "quota") {
          const liveLogger = require("../utils/liveLogger.js");
          liveLogger.proxyQuotaExceeded("rotation", candidate.accountId);
        }

        if (outcome.rotate === false) throw lastError;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("No available accounts after exhausting all configured accounts");
  }

  async getApiEndpoint(credentials: any): Promise<string> {
    if (credentials && credentials.resource_url) {
      let endpoint = credentials.resource_url;
      if (!endpoint.startsWith("http")) {
        endpoint = `https://${endpoint}`;
      }
      if (!endpoint.endsWith("/v1")) {
        endpoint = endpoint.endsWith("/") ? `${endpoint}v1` : `${endpoint}/v1`;
      }
      return endpoint;
    }

    return DEFAULT_QWEN_API_BASE_URL;
  }

  async loadRetryConfig(): Promise<{ maxRetries: number; backoffMs: number }> {
    // Try loading from persisted runtime config
    try {
      const { RuntimeConfigStore } = require("../core/config/runtime-config-store.js") as any;
      const store = new RuntimeConfigStore();
      const retryConfig = await store.getRetryConfig();
      return {
        maxRetries: retryConfig.maxRetriesPerAccount,
        backoffMs: retryConfig.retryBackoffMs,
      };
    } catch {
      // Fallback to env vars or defaults
      return {
        maxRetries: parseInt(process.env.MAX_RETRIES_PER_ACCOUNT || "3", 10) || 3,
        backoffMs: parseInt(process.env.RETRY_BACKOFF_MS || "1000", 10) || 1000,
      };
    }
  }

  async chatCompletions(request: any): Promise<any> {
    await this.authManager.loadAllAccounts();
    const configuredAccounts = request.accountId ? [request.accountId] : (this.authManager.getAccountIds().length > 0 ? this.authManager.getAccountIds() : ["default"]);
    const retryConfig = await this.loadRetryConfig();

    return await this.executeWithAccountRotation(
      configuredAccounts,
      async (accountInfo) => await this.processRequestWithAccount(request, accountInfo),
      async (accountId, response) => {
        await this.incrementRequestCount(accountId);
        if (response && response.usage) {
          await this.recordTokenUsage(accountId, response.usage);
        }
      },
      retryConfig,
    );
  }

  async processRequestWithAccount(request: any, accountInfo: AccountInfo): Promise<any> {
    const { credentials } = accountInfo;
    const apiEndpoint = await this.getApiEndpoint(credentials);
    const url = `${apiEndpoint}/chat/completions`;
    const model = resolveModelAlias(request.model) || DEFAULT_MODEL;
    const visionMessages = processMessagesForVision(request.messages, model);
    const processedMessages = transformMessagesForPortal(visionMessages);
    const maxTokens = clampMaxTokens(model, request.max_tokens);

    const payload = {
      model,
      messages: processedMessages,
      temperature: request.temperature,
      max_tokens: maxTokens,
      top_p: request.top_p,
      top_k: request.top_k,
      repetition_penalty: request.repetition_penalty,
      tools: request.tools,
      tool_choice: request.tool_choice,
      ...resolveThinkingParams(request),
      stream: false,
    };

    try {
      const response = await axios.post(url, payload, {
        headers: buildDashScopeHeaders(credentials.access_token, false),
        responseType: "text",
        transformResponse: [(data: string) => data],
        timeout: 300000,
        httpAgent,
        httpsAgent,
      });

      return parseJsonResponseBody(response.data, "chat completions upstream");
    } catch (error: any) {
      throw await attachUpstreamErrorDetails(error);
    }
  }

  async listModels(): Promise<any> {
    console.log("Returning mock models list");
    return {
      object: "list",
      data: QWEN_MODELS,
    };
  }

  async processStreamingRequestWithAccount(request: any, accountInfo: AccountInfo): Promise<any> {
    const { credentials } = accountInfo;
    const apiEndpoint = await this.getApiEndpoint(credentials);
    const url = `${apiEndpoint}/chat/completions`;
    const model = resolveModelAlias(request.model) || DEFAULT_MODEL;
    const visionMessages = processMessagesForVision(request.messages, model);
    const processedMessages = transformMessagesForPortal(visionMessages);
    const maxTokens = clampMaxTokens(model, request.max_tokens);
    const payload = {
      model,
      messages: processedMessages,
      temperature: request.temperature,
      max_tokens: maxTokens,
      top_p: request.top_p,
      top_k: request.top_k,
      repetition_penalty: request.repetition_penalty,
      tools: request.tools,
      tool_choice: request.tool_choice,
      ...resolveThinkingParams(request),
      stream: true,
      stream_options: { include_usage: true },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: buildDashScopeHeaders(credentials.access_token, true),
        timeout: 300000,
        responseType: "stream",
        httpAgent,
        httpsAgent,
      });
      const stream = new PassThrough();
      let usageBuffer = "";
      let latestUsage: any = null;
      const usagePromise = new Promise<any>((resolve) => {
        response.data.on("data", (chunk: Buffer) => {
          usageBuffer += chunk.toString();
          const parsed = extractUsageFromSseText(usageBuffer, latestUsage);
          usageBuffer = parsed.buffer;
          latestUsage = parsed.latestUsage;
        });

        response.data.on("end", () => resolve(latestUsage));
        response.data.on("error", () => resolve(latestUsage));
      });
      response.data.pipe(stream);
      (stream as any).usagePromise = usagePromise;
      return stream;
    } catch (error: any) {
      throw await attachUpstreamErrorDetails(error);
    }
  }

  async streamChatCompletions(request: any): Promise<any> {
    await this.authManager.loadAllAccounts();
    const configuredAccounts = request.accountId ? [request.accountId] : (this.authManager.getAccountIds().length > 0 ? this.authManager.getAccountIds() : ["default"]);
    const retryConfig = await this.loadRetryConfig();

    return await this.executeWithAccountRotation(
      configuredAccounts,
      async (accountInfo) => await this.processStreamingRequestWithAccount(request, accountInfo),
      async (accountId: string, response: any) => {
        await this.incrementRequestCount(accountId);
        if (response?.usagePromise) {
          void response.usagePromise
            .then((usage: any) => (usage ? this.recordTokenUsage(accountId, usage) : null))
            .catch(() => null);
        }
      },
      retryConfig,
    );
  }

  async webSearch(request: any): Promise<any> {
    await this.authManager.loadAllAccounts();
    const configuredAccounts = request.accountId ? [request.accountId] : (this.authManager.getAccountIds().length > 0 ? this.authManager.getAccountIds() : ["default"]);
    const retryConfig = await this.loadRetryConfig();

    return await this.executeWithAccountRotation(
      configuredAccounts,
      async (accountInfo) => await this.processWebSearchWithAccount(request, accountInfo),
      async (accountId, response) => {
        await this.incrementWebSearchRequestCount(accountId);
        const resultCount = response?.data?.docs?.length || 0;
        if (resultCount > 0) {
          await this.incrementWebSearchResultCount(accountId, resultCount);
        }
      },
      retryConfig,
    );
  }

  async getWebSearchEndpoint(credentials: any): Promise<string> {
    if (credentials && credentials.resource_url) {
      let endpoint = credentials.resource_url;
      if (!endpoint.startsWith("http")) {
        endpoint = `https://${endpoint}`;
      }
      return endpoint.replace(/\/$/, "");
    }

    return "https://dashscope.aliyuncs.com/compatible-mode";
  }

  async processWebSearchWithAccount(request: any, accountInfo: AccountInfo): Promise<any> {
    const { accountId, credentials } = accountInfo;
    const webSearchBaseUrl = await this.getWebSearchEndpoint(credentials);
    const webSearchUrl = `${webSearchBaseUrl}/api/v1/indices/plugin/web_search`;
    const payload = {
      uq: request.query,
      page: request.page || 1,
      rows: request.rows || 10,
    };

    try {
      const response = await axios.post(webSearchUrl, payload, {
        headers: buildDashScopeHeaders(credentials.access_token, false),
        responseType: "text",
        transformResponse: [(data: string) => data],
        timeout: 300000,
        httpAgent,
        httpsAgent,
      });

      const responseData = parseJsonResponseBody(response.data, "web search upstream");
      console.log(`\x1b[32mWeb search completed using ${accountId}. Found ${responseData?.data?.total || 0} results.\x1b[0m`);
      return responseData;
    } catch (error: any) {
      throw await attachUpstreamErrorDetails(error);
    }
  }
}
