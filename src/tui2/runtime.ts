import { createRequire } from "module";
import type { AccountInfo, ArtifactNode, LogLevel, RotationMode, RuntimeSummary, ServerState, UsageDay } from "./types.js";

const require = createRequire(import.meta.url);
const fs = require("node:fs") as typeof import("node:fs");
const fsPromises = fs.promises;
const nodePath = require("node:path") as typeof import("node:path");
const usageStore = require("../utils/usageStore.js") as typeof import("../utils/usageStore.js");

type ConfigModule = {
  host?: string;
  port?: number;
};

type AuthManagerLike = {
  loadAllAccounts: () => Promise<unknown>;
  getAccountIds: () => string[];
  loadCredentials: () => Promise<unknown>;
  getAccountCredentials: (accountId: string) => { expiry_date?: number } | null;
  isAccountValid: (accountId: string) => boolean;
  initiateDeviceFlow: () => Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    code_verifier: string;
  }>;
  pollForToken: (deviceCode: string, codeVerifier: string, accountId?: string | null) => Promise<unknown>;
  removeAccount: (accountId: string) => Promise<void>;
};

type QwenApiLike = {
  authManager: AuthManagerLike;
  requestCount: Map<string, number>;
  lastResetDate: string;
  tokenUsage: Map<string, Array<{
    date: string;
    requests?: number;
    requestsKnown?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cacheTypes?: string[];
    cacheType?: string;
  }>>;
  loadRequestCounts: () => Promise<void>;
};

type QwenApiModule = {
  QwenAPI: new () => QwenApiLike;
};

type StartedServer = {
  host: string;
  port: number;
  stop: (reason?: string) => Promise<void>;
};

type HeadlessRuntimeModule = {
  startHeadlessServer: (options?: { host?: string; port?: number; registerProcessHandlers?: boolean }) => Promise<StartedServer>;
};

type FileLoggerLike = {
  getRuntimeStatus: () => Promise<{ currentLogLevel?: LogLevel }>;
  setRuntimeLogLevel: (level: LogLevel, persist?: boolean) => Promise<unknown>;
  LOG_DIR: string;
};

const config = require("../config.js") as ConfigModule;
const { QwenAPI } = require("../qwen/api.js") as QwenApiModule;
const { startHeadlessServer } = require("../server/headless-runtime.js") as HeadlessRuntimeModule;
const fileLogger = require("../utils/fileLogger.js") as FileLoggerLike;
const runtimeActivity = require("../utils/runtimeActivity.js") as typeof import("../utils/runtimeActivity.js");

function resolveRotationMode(accountCount: number): RotationMode {
  if (accountCount > 1) {
    return "RR";
  }

  if (accountCount === 1) {
    return "single";
  }

  return "none";
}

function sumRequestCounts(requestCounts: Map<string, number>): number {
  return Array.from(requestCounts.values()).reduce((total, count) => total + count, 0);
}

function asCount(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(num) || num <= 0) {
    return 0;
  }
  return num;
}

function resolveCacheTypes(value: { cacheTypes?: string[]; cacheType?: string }): string[] {
  if (Array.isArray(value.cacheTypes)) {
    return value.cacheTypes.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }

  if (typeof value.cacheType === "string" && value.cacheType.length > 0) {
    return [value.cacheType];
  }

  return [];
}

function resolveCacheTypeLabel(cacheTypes: Set<string>): string {
  if (cacheTypes.size === 0) {
    return "--";
  }

  if (cacheTypes.size === 1) {
    return Array.from(cacheTypes)[0] ?? "--";
  }

  return "mixed";
}

function sortArtifactEntries(a: { name: string; isDirectory: () => boolean }, b: { name: string; isDirectory: () => boolean }): number {
  if (a.isDirectory() !== b.isDirectory()) {
    return a.isDirectory() ? -1 : 1;
  }

  return a.name.localeCompare(b.name);
}

async function buildArtifactTree(rootDir: string, relativePath = ""): Promise<readonly ArtifactNode[]> {
  const dirPath = relativePath.length > 0 ? nodePath.join(rootDir, relativePath) : rootDir;

  let entries: readonly any[] = [];
  try {
    entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return Object.freeze([]);
    }
    throw error;
  }

  const nodes = await Promise.all(
    [...entries]
      .filter((entry) => !entry.name.startsWith("."))
      .sort(sortArtifactEntries)
      .map(async (entry) => {
        const nextPath = relativePath.length > 0 ? nodePath.join(relativePath, entry.name) : entry.name;
        const fullPath = nodePath.join(rootDir, nextPath);

        if (entry.isDirectory()) {
          return Object.freeze({
            name: entry.name,
            path: nextPath,
            type: "directory" as const,
            children: await buildArtifactTree(rootDir, nextPath),
          });
        }

        const stat = await fsPromises.stat(fullPath).catch(() => null);
        return Object.freeze({
          name: entry.name,
          path: nextPath,
          type: "file" as const,
          size: stat?.size,
        });
      }),
  );

  return Object.freeze(nodes);
}

async function readArtifactPreview(rootDir: string, relativePath: string): Promise<string | null> {
  const resolvedRoot = nodePath.resolve(rootDir);
  const resolvedPath = nodePath.resolve(rootDir, relativePath);
  if (!resolvedPath.startsWith(`${resolvedRoot}${nodePath.sep}`) && resolvedPath !== resolvedRoot) {
    return null;
  }

  const stat = await fsPromises.stat(resolvedPath).catch(() => null);
  if (!stat?.isFile()) {
    return null;
  }

  const content = await fsPromises.readFile(resolvedPath, "utf8");
  return content.length > 24_000 ? `${content.slice(0, 24_000)}\n\n... truncated ...` : content;
}

export function aggregateUsageDays(
  tokenUsage: Map<string, Array<{
    date: string;
    requests?: number;
    requestsKnown?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cacheTypes?: string[];
    cacheType?: string;
  }>>,
  requestCounts: Map<string, number>,
  lastResetDate: string,
  webSearchRequests = 0,
  webSearchResults = 0,
): readonly UsageDay[] {
  const days = new Map<string, {
    date: string;
    requests: number;
    requestsKnown: boolean;
    requestFloor: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cacheTypes: Set<string>;
  }>();

  for (const usageEntries of tokenUsage.values()) {
    for (const entry of usageEntries) {
      const date = String(entry?.date ?? "");
      if (date.length === 0) {
        continue;
      }

      if (!days.has(date)) {
        days.set(date, {
          date,
          requests: 0,
          requestsKnown: true,
          requestFloor: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          cacheTypes: new Set<string>(),
        });
      }

      const day = days.get(date);
      if (!day) {
        continue;
      }

      const requestsKnown = entry?.requestsKnown !== false && typeof entry?.requests === "number";
      const requestFloor =
        asCount(entry?.inputTokens) > 0 ||
        asCount(entry?.outputTokens) > 0 ||
        asCount(entry?.cacheReadTokens) > 0 ||
        asCount(entry?.cacheWriteTokens) > 0
          ? 1
          : 0;
      day.requestsKnown = day.requestsKnown && requestsKnown;
      day.requests += asCount(entry?.requests);
      day.requestFloor += requestFloor;
      day.inputTokens += asCount(entry?.inputTokens);
      day.outputTokens += asCount(entry?.outputTokens);
      day.cacheReadTokens += asCount(entry?.cacheReadTokens);
      day.cacheWriteTokens += asCount(entry?.cacheWriteTokens);
      for (const cacheType of resolveCacheTypes(entry)) {
        day.cacheTypes.add(cacheType);
      }
    }
  }

  return Object.freeze(
    Array.from(days.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((day, index) => {
        if (day.date === lastResetDate && !day.requestsKnown) {
          day.requests = sumRequestCounts(requestCounts);
          day.requestsKnown = true;
        }

        const cacheTotal = day.cacheReadTokens + day.cacheWriteTokens;
        return Object.freeze({
          date: day.date,
          requests: day.requests,
          requestsKnown: day.requestsKnown,
          requestFloor: day.requestFloor,
          inputTokens: day.inputTokens,
          outputTokens: day.outputTokens,
          cacheReadTokens: day.cacheReadTokens,
          cacheWriteTokens: day.cacheWriteTokens,
          cacheTypeLabel: resolveCacheTypeLabel(day.cacheTypes),
          cacheHitRate: cacheTotal > 0 ? day.cacheReadTokens / cacheTotal : 0,
          webSearchRequests: index === 0 ? webSearchRequests : 0,
          webSearchResults: index === 0 ? webSearchResults : 0,
        });
      }),
  );
}

export function createRuntimeMonitor(_bootMs: number): {
  refresh: () => Promise<RuntimeSummary>;
  loadAccounts: () => Promise<readonly AccountInfo[]>;
  loadUsage: () => Promise<readonly UsageDay[]>;
  loadArtifacts: () => Promise<readonly ArtifactNode[]>;
  loadArtifactPreview: (path: string) => Promise<string | null>;
  initiateAddAccountFlow: () => Promise<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    codeVerifier: string;
  }>;
  completeAddAccountFlow: (deviceCode: string, codeVerifier: string, accountId: string) => Promise<void>;
  deleteAccount: (accountId: string) => Promise<void>;
  startServer: () => Promise<RuntimeSummary>;
  stopServer: () => Promise<RuntimeSummary>;
  restartServer: () => Promise<RuntimeSummary>;
  setLogLevel: (level: LogLevel) => Promise<RuntimeSummary>;
  dispose: () => Promise<void>;
} {
  const qwenAPI = new QwenAPI();
  let serverState: ServerState = "stopped";
  let serverHandle: StartedServer | null = null;
  let serverBootMs = 0;

  async function buildAccounts(): Promise<readonly AccountInfo[]> {
    await Promise.allSettled([qwenAPI.loadRequestCounts(), qwenAPI.authManager.loadAllAccounts()]);

    const accountIds = qwenAPI.authManager.getAccountIds().slice().sort((a, b) => a.localeCompare(b));
    return Object.freeze(
      accountIds.map((accountId) => {
        const credentials = qwenAPI.authManager.getAccountCredentials(accountId);
        const isValid = qwenAPI.authManager.isAccountValid(accountId);

        return Object.freeze({
          id: accountId,
          status: isValid ? "valid" : credentials ? "expired" : "unknown",
          expiresAt: typeof credentials?.expiry_date === "number" ? credentials.expiry_date : undefined,
          todayRequests: qwenAPI.requestCount.get(accountId) ?? 0,
        });
      }),
    );
  }

  async function buildSummary(): Promise<RuntimeSummary> {
    await Promise.allSettled([qwenAPI.loadRequestCounts(), qwenAPI.authManager.loadAllAccounts()]);

    const namedAccounts = qwenAPI.authManager.getAccountIds();
    const defaultCredentials = namedAccounts.length === 0
      ? await qwenAPI.authManager.loadCredentials().catch(() => null)
      : null;
    const accountCount = namedAccounts.length > 0 ? namedAccounts.length : defaultCredentials ? 1 : 0;
    const activity = runtimeActivity.getActivitySnapshot();

    return Object.freeze({
      serverState,
      status: accountCount > 0 ? "ready" : "unauthenticated",
      host: serverHandle?.host ?? config.host ?? "localhost",
      port: serverHandle?.port ?? config.port ?? 8080,
      uptimeMs: serverState === "running" ? Math.max(0, Date.now() - serverBootMs) : 0,
      rotationMode: resolveRotationMode(accountCount),
      accountCount,
      requestCount: sumRequestCounts(qwenAPI.requestCount),
      streamCount: activity.activeStreams,
    });
  }

  return {
    async refresh(): Promise<RuntimeSummary> {
      return buildSummary();
    },
    async loadAccounts(): Promise<readonly AccountInfo[]> {
      return buildAccounts();
    },
    async loadUsage(): Promise<readonly UsageDay[]> {
      await qwenAPI.loadRequestCounts();
      const webSearchTotals = usageStore.getTotalWebSearchCounts();
      return aggregateUsageDays(qwenAPI.tokenUsage, qwenAPI.requestCount, qwenAPI.lastResetDate, webSearchTotals.requests, webSearchTotals.results);
    },
    async loadArtifacts(): Promise<readonly ArtifactNode[]> {
      return buildArtifactTree(fileLogger.LOG_DIR);
    },
    async loadArtifactPreview(path: string): Promise<string | null> {
      return readArtifactPreview(fileLogger.LOG_DIR, path);
    },
    async initiateAddAccountFlow(): Promise<{
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
      codeVerifier: string;
    }> {
      const flow = await qwenAPI.authManager.initiateDeviceFlow();
      return Object.freeze({
        deviceCode: flow.device_code,
        userCode: flow.user_code,
        verificationUri: flow.verification_uri,
        verificationUriComplete: flow.verification_uri_complete,
        codeVerifier: flow.code_verifier,
      });
    },
    async completeAddAccountFlow(deviceCode: string, codeVerifier: string, accountId: string): Promise<void> {
      await qwenAPI.authManager.pollForToken(deviceCode, codeVerifier, accountId);
    },
    async deleteAccount(accountId: string): Promise<void> {
      await qwenAPI.authManager.removeAccount(accountId);
    },
    async startServer(): Promise<RuntimeSummary> {
      if (serverState === "running" || serverState === "starting") {
        return buildSummary();
      }

      serverState = "starting";
      try {
        serverHandle = await startHeadlessServer({ host: config.host, port: config.port, registerProcessHandlers: false });
        serverBootMs = Date.now();
        serverState = "running";
        return buildSummary();
      } catch (error) {
        serverHandle = null;
        serverBootMs = 0;
        serverState = "stopped";
        throw error;
      }
    },
    async stopServer(): Promise<RuntimeSummary> {
      if (!serverHandle || serverState === "stopped" || serverState === "stopping") {
        serverState = "stopped";
        return buildSummary();
      }

      serverState = "stopping";
      try {
        await serverHandle.stop("TUI stop requested");
      } finally {
        serverHandle = null;
        serverBootMs = 0;
        serverState = "stopped";
      }

      return buildSummary();
    },
    async restartServer(): Promise<RuntimeSummary> {
      if (serverHandle) {
        serverState = "stopping";
        await serverHandle.stop("TUI restart requested");
        serverHandle = null;
        serverBootMs = 0;
      }

      serverState = "starting";
      try {
        serverHandle = await startHeadlessServer({ host: config.host, port: config.port, registerProcessHandlers: false });
        serverBootMs = Date.now();
        serverState = "running";
        return buildSummary();
      } catch (error) {
        serverHandle = null;
        serverBootMs = 0;
        serverState = "stopped";
        throw error;
      }
    },
    async setLogLevel(level: LogLevel): Promise<RuntimeSummary> {
      await fileLogger.setRuntimeLogLevel(level, true);
      return buildSummary();
    },
    async dispose(): Promise<void> {
      if (!serverHandle) {
        return;
      }

      await serverHandle.stop("TUI exit");
      serverHandle = null;
      serverBootMs = 0;
      serverState = "stopped";
    },
  };
}
