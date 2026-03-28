import { createRequire } from "module";
import type { AccountInfo, LogLevel, RotationMode, RuntimeSummary, ServerState } from "../types.js";

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
};

type QwenApiLike = {
  authManager: AuthManagerLike;
  requestCount: Map<string, number>;
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
};

const require = createRequire(import.meta.url);
const config = require("../../config.js") as ConfigModule;
const { QwenAPI } = require("../../qwen/api.js") as QwenApiModule;
const { startHeadlessServer } = require("../../server/headless-runtime.js") as HeadlessRuntimeModule;
const fileLogger = require("../../utils/fileLogger.js") as FileLoggerLike;
const runtimeActivity = require("../../utils/runtimeActivity.js") as typeof import("../../utils/runtimeActivity.js");

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

export function createRuntimeMonitor(_bootMs: number): {
  refresh: () => Promise<RuntimeSummary>;
  loadAccounts: () => Promise<readonly AccountInfo[]>;
  initiateAddAccountFlow: () => Promise<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    codeVerifier: string;
  }>;
  completeAddAccountFlow: (deviceCode: string, codeVerifier: string, accountId: string) => Promise<void>;
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
