const axios: any = require("axios");
const http = require("node:http") as typeof import("node:http");
const https = require("node:https") as typeof import("node:https");
const { QwenAuthManager } = require("./auth.js") as any;
const { PassThrough } = require("node:stream") as typeof import("node:stream");
const path = require("node:path") as typeof import("node:path");
const { promises: fs } = require("node:fs") as typeof import("node:fs");
const crypto = require("node:crypto") as typeof import("node:crypto");

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
});

const DEFAULT_QWEN_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen3-coder-plus";
const QWEN_CODE_VERSION = "0.12.0";

const MODEL_ALIASES: Record<string, string> = {
  "qwen3.5-plus": "coder-model",
};

const MODEL_LIMITS: Record<string, { maxTokens: number }> = {
  "vision-model": { maxTokens: 32768 },
  "qwen3-vl-plus": { maxTokens: 32768 },
  "qwen3-vl-max": { maxTokens: 32768 },
};

const QWEN_MODELS = [
  { id: "qwen3-coder-plus", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "qwen3-coder-flash", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "qwen3-coder-flash", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "coder-model", object: "model", created: 1754686206, owned_by: "qwen" },
  { id: "vision-model", object: "model", created: 1754686206, owned_by: "qwen" },
];

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

function generateUserAgent(): string {
  return `QwenCode/${QWEN_CODE_VERSION} (${process.platform}; ${process.arch})`;
}

function generateRequestId(): string {
  return crypto.randomUUID();
}

function buildDashScopeHeaders(accessToken: string, isStreaming = false): Record<string, string> {
  const userAgent = generateUserAgent();
  const headers: Record<string, string> = {
    connection: "keep-alive",
    accept: "application/json",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    "user-agent": userAgent,
    "x-dashscope-authtype": "qwen-oauth",
    "x-dashscope-cachecontrol": "enable",
    "x-dashscope-useragent": userAgent,
    "x-stainless-arch": process.arch,
    "x-stainless-lang": "js",
    "x-stainless-os": process.platform,
    "x-stainless-package-version": "5.11.0",
    "x-stainless-retry-count": "1",
    "x-stainless-runtime": "node",
    "x-stainless-runtime-version": process.version,
    "accept-language": "*",
    "sec-fetch-mode": "cors",
    "x-request-id": generateRequestId(),
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

function classifyRequestError(error: any): "auth" | "client" | "retryable" {
  if (isAuthError(error)) {
    return "auth";
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
  requestCountFile: string;
  lastSaveTime: number;
  saveInterval: number;
  pendingSave: boolean;
  accountLocks: Map<string, boolean>;
  accountQueues: Map<string, unknown>;
  webSearchRequestCounts: Map<string, number>;
  webSearchResultCounts: Map<string, number>;

  constructor() {
    this.authManager = new QwenAuthManager();
    this.requestCount = new Map();
    this.tokenUsage = new Map();
    this.lastResetDate = new Date().toISOString().split("T")[0] as string;
    this.requestCountFile = path.join(this.authManager.qwenDir, "request_counts.json");
    this.lastSaveTime = 0;
    this.saveInterval = 60000;
    this.pendingSave = false;
    this.accountLocks = new Map();
    this.accountQueues = new Map();
    this.webSearchRequestCounts = new Map();
    this.webSearchResultCounts = new Map();
    void this.loadRequestCounts();
  }

  async loadRequestCounts(): Promise<void> {
    try {
      const data = await fs.readFile(this.requestCountFile, "utf8");
      const counts = JSON.parse(data) as any;

      if (counts.lastResetDate) {
        this.lastResetDate = counts.lastResetDate;
      }

      if (counts.requests) {
        for (const [accountId, count] of Object.entries(counts.requests)) {
          this.requestCount.set(accountId, Number(count));
        }
      }

      if (counts.tokenUsage) {
        for (const [accountId, usageData] of Object.entries(counts.tokenUsage)) {
          const normalizedUsage = Array.isArray(usageData)
            ? usageData.map((entry) => this.normalizeUsageEntry(entry, String(entry?.date || this.lastResetDate)))
            : [];
          this.tokenUsage.set(accountId, normalizedUsage);
        }
      }

      if (counts.webSearchRequests) {
        for (const [accountId, count] of Object.entries(counts.webSearchRequests)) {
          this.webSearchRequestCounts.set(accountId, Number(count));
        }
      }

      if (counts.webSearchResults) {
        for (const [accountId, count] of Object.entries(counts.webSearchResults)) {
          this.webSearchResultCounts.set(accountId, Number(count));
        }
      } else {
        console.log("Migrating old data structure - adding webSearchResults tracking");
        for (const accountId of this.webSearchRequestCounts.keys()) {
          this.webSearchResultCounts.set(accountId, 0);
        }
      }

      this.resetRequestCountsIfNeeded();
    } catch {
      this.resetRequestCountsIfNeeded();
    }
  }

  async saveRequestCounts(): Promise<void> {
    try {
      const counts = {
        lastResetDate: this.lastResetDate,
        requests: Object.fromEntries(this.requestCount),
        webSearchRequests: Object.fromEntries(this.webSearchRequestCounts),
        webSearchResults: Object.fromEntries(this.webSearchResultCounts),
        tokenUsage: Object.fromEntries(this.tokenUsage),
      };

      await fs.writeFile(this.requestCountFile, JSON.stringify(counts, null, 2));
      this.lastSaveTime = Date.now();
      this.pendingSave = false;
    } catch (error: any) {
      console.warn("Failed to save request counts:", error.message);
      this.pendingSave = false;
    }
  }

  scheduleSave(): void {
    if (this.pendingSave) {
      return;
    }

    this.pendingSave = true;
    const now = Date.now();
    if (now - this.lastSaveTime < this.saveInterval) {
      setTimeout(() => {
        void this.saveRequestCounts();
      }, this.saveInterval);
    } else {
      void this.saveRequestCounts();
    }
  }

  resetRequestCountsIfNeeded(): void {
    const today = new Date().toISOString().split("T")[0] as string;
    if (today !== this.lastResetDate) {
      this.requestCount.clear();
      this.webSearchRequestCounts.clear();
      this.webSearchResultCounts.clear();
      this.lastResetDate = today;
      console.log("Request counts reset for new UTC day");
      void this.saveRequestCounts();
    }
  }

  normalizeUsageEntry(entry: any, date: string): RequestUsageEntry {
    const cacheTypes = Array.isArray(entry?.cacheTypes)
      ? entry.cacheTypes.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      : typeof entry?.cacheType === "string" && entry.cacheType.length > 0
        ? [entry.cacheType]
        : [];

    return {
      date,
      requests: asNonNegativeNumber(entry?.requests),
      requestsKnown: typeof entry?.requests === "number" || entry?.requestsKnown === true,
      inputTokens: asNonNegativeNumber(entry?.inputTokens),
      outputTokens: asNonNegativeNumber(entry?.outputTokens),
      cacheReadTokens: asNonNegativeNumber(entry?.cacheReadTokens),
      cacheWriteTokens: asNonNegativeNumber(entry?.cacheWriteTokens),
      cacheTypes: Array.from(new Set<string>(cacheTypes)),
    };
  }

  ensureUsageEntry(accountId: string, date: string): RequestUsageEntry {
    if (!this.tokenUsage.has(accountId)) {
      this.tokenUsage.set(accountId, []);
    }

    const accountUsage = this.tokenUsage.get(accountId) as RequestUsageEntry[];
    const existingIndex = accountUsage.findIndex((entry) => entry.date === date);
    if (existingIndex >= 0) {
      const normalized = this.normalizeUsageEntry(accountUsage[existingIndex], date);
      accountUsage[existingIndex] = normalized;
      return normalized;
    }

    const nextEntry: RequestUsageEntry = {
      date,
      requests: 0,
      requestsKnown: true,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheTypes: [],
    };
    accountUsage.push(nextEntry);
    return nextEntry;
  }

  async incrementWebSearchRequestCount(accountId: string): Promise<void> {
    const currentCount = this.webSearchRequestCounts.get(accountId) || 0;
    this.webSearchRequestCounts.set(accountId, currentCount + 1);
    this.scheduleSave();
  }

  getWebSearchRequestCount(accountId: string): number {
    return this.webSearchRequestCounts.get(accountId) || 0;
  }

  async incrementWebSearchResultCount(accountId: string, resultCount: number): Promise<void> {
    const currentCount = this.webSearchResultCounts.get(accountId) || 0;
    this.webSearchResultCounts.set(accountId, currentCount + resultCount);
    this.scheduleSave();
  }

  getWebSearchResultCount(accountId: string): number {
    return this.webSearchResultCounts.get(accountId) || 0;
  }

  async incrementRequestCount(accountId: string): Promise<void> {
    this.resetRequestCountsIfNeeded();
    const currentDate = new Date().toISOString().split("T")[0] as string;
    const currentCount = this.requestCount.get(accountId) || 0;
    this.requestCount.set(accountId, currentCount + 1);
    const usageEntry = this.ensureUsageEntry(accountId, currentDate);
    usageEntry.requests += 1;
    this.scheduleSave();
  }

  async recordTokenUsage(accountId: string, usage: any): Promise<void> {
    try {
      const currentDate = new Date().toISOString().split("T")[0] as string;
      const metrics = extractUsageMetrics(usage);
      const todayEntry = this.ensureUsageEntry(accountId, currentDate);
      todayEntry.inputTokens += metrics.inputTokens;
      todayEntry.outputTokens += metrics.outputTokens;
      todayEntry.cacheReadTokens += metrics.cacheReadTokens;
      todayEntry.cacheWriteTokens += metrics.cacheWriteTokens;
      if (metrics.cacheType && !todayEntry.cacheTypes.includes(metrics.cacheType)) {
        todayEntry.cacheTypes.push(metrics.cacheType);
      }

      this.scheduleSave();
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

  async executeAttemptWithLock(accountInfo: AccountInfo, executeAttempt: (accountInfo: AccountInfo) => Promise<any>): Promise<any> {
    const lockAcquired = await this.acquireAccountLock(accountInfo.accountId);
    if (!lockAcquired) {
      const lockError: any = new Error(`Account ${accountInfo.accountId} is currently in use`);
      lockError.code = "ACCOUNT_LOCKED";
      throw lockError;
    }

    try {
      return await executeAttempt(accountInfo);
    } finally {
      this.releaseAccountLock(accountInfo.accountId);
    }
  }

  async executeOperationWithAccount(accountInfo: AccountInfo, executeAttempt: (accountInfo: AccountInfo) => Promise<any>): Promise<any> {
    try {
      return await this.executeAttemptWithLock(accountInfo, executeAttempt);
    } catch (error: any) {
      if (error.code === "ACCOUNT_LOCKED") {
        throw { error, rotate: true, locked: true };
      }

      const errorType = classifyRequestError(error);
      if (errorType !== "auth") {
        throw {
          error,
          rotate: errorType !== "client",
          locked: false,
        };
      }

      console.log(`\x1b[33mAuth error for ${accountInfo.accountId}, attempting refresh...\x1b[0m`);
      let refreshedCredentials: any;
      try {
        refreshedCredentials = await this.authManager.refreshCredentialsIfNeeded(
          accountInfo.credentials,
          accountInfo.accountId === "default" ? null : accountInfo.accountId,
          { force: true },
        );
      } catch (refreshError) {
        throw { error: refreshError, rotate: true, locked: false };
      }

      try {
        return await this.executeAttemptWithLock({ ...accountInfo, credentials: refreshedCredentials }, executeAttempt);
      } catch (retryError: any) {
        if (retryError.code === "ACCOUNT_LOCKED") {
          throw { error: retryError, rotate: true, locked: true };
        }

        const retryErrorType = classifyRequestError(retryError);
        throw {
          error: retryError,
          rotate: retryErrorType !== "client",
          locked: false,
        };
      }
    }
  }

  async executeWithAccountRotation(accountIds: string[], executeAttempt: (accountInfo: AccountInfo) => Promise<any>, onSuccess: (accountId: string, result: any) => Promise<void>): Promise<any> {
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
        const result = await this.executeOperationWithAccount(candidate, executeAttempt);
        await onSuccess(candidate.accountId, result);
        return result;
      } catch (outcome: any) {
        lastError = outcome.error || outcome;
        if (outcome.rotate === false) {
          throw lastError;
        }
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

  async chatCompletions(request: any): Promise<any> {
    await this.authManager.loadAllAccounts();
    const configuredAccounts = request.accountId ? [request.accountId] : (this.authManager.getAccountIds().length > 0 ? this.authManager.getAccountIds() : ["default"]);

    return await this.executeWithAccountRotation(
      configuredAccounts,
      async (accountInfo) => await this.processRequestWithAccount(request, accountInfo),
      async (accountId, response) => {
        await this.incrementRequestCount(accountId);
        if (response && response.usage) {
          await this.recordTokenUsage(accountId, response.usage);
        }
      },
    );
  }

  async processRequestWithAccount(request: any, accountInfo: AccountInfo): Promise<any> {
    const { credentials } = accountInfo;
    const apiEndpoint = await this.getApiEndpoint(credentials);
    const url = `${apiEndpoint}/chat/completions`;
    const model = resolveModelAlias(request.model) || DEFAULT_MODEL;
    const processedMessages = processMessagesForVision(request.messages, model);
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
      reasoning: request.reasoning,
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
  async acquireAccountLock(accountId: string | null | undefined): Promise<boolean> {
    const normalizedId = this.normalizeAccountId(accountId);
    if (!this.accountLocks.has(normalizedId)) {
      this.accountLocks.set(normalizedId, true);
      return true;
    }

    return false;
  }

  releaseAccountLock(accountId: string | null | undefined): void {
    const normalizedId = this.normalizeAccountId(accountId);
    if (this.accountLocks.has(normalizedId)) {
      this.accountLocks.delete(normalizedId);
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
    const processedMessages = processMessagesForVision(request.messages, model);
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
      reasoning: request.reasoning,
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
    );
  }

  async webSearch(request: any): Promise<any> {
    await this.authManager.loadAllAccounts();
    const configuredAccounts = request.accountId ? [request.accountId] : (this.authManager.getAccountIds().length > 0 ? this.authManager.getAccountIds() : ["default"]);

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
