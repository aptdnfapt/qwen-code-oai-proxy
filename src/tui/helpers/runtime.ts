import { createRequire } from "module";
import type { RotationMode, RuntimeSummary } from "../types.js";

type ConfigModule = {
  host?: string;
  port?: number;
};

type AuthManagerLike = {
  loadAllAccounts: () => Promise<unknown>;
  getAccountIds: () => string[];
  loadCredentials: () => Promise<unknown>;
};

type QwenApiLike = {
  authManager: AuthManagerLike;
  requestCount: Map<string, number>;
  loadRequestCounts: () => Promise<void>;
};

type QwenApiModule = {
  QwenAPI: new () => QwenApiLike;
};

const require = createRequire(import.meta.url);
const config = require("../../config.js") as ConfigModule;
const { QwenAPI } = require("../../qwen/api.js") as QwenApiModule;
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

export function createRuntimeMonitor(bootMs: number): { refresh: () => Promise<RuntimeSummary> } {
  const qwenAPI = new QwenAPI();

  return {
    async refresh(): Promise<RuntimeSummary> {
      await Promise.allSettled([qwenAPI.loadRequestCounts(), qwenAPI.authManager.loadAllAccounts()]);

      const namedAccounts = qwenAPI.authManager.getAccountIds();
      const defaultCredentials = namedAccounts.length === 0
        ? await qwenAPI.authManager.loadCredentials().catch(() => null)
        : null;
      const accountCount = namedAccounts.length > 0 ? namedAccounts.length : defaultCredentials ? 1 : 0;
      const activity = runtimeActivity.getActivitySnapshot();

      return Object.freeze({
        status: accountCount > 0 ? "ready" : "unauthenticated",
        host: config.host ?? "localhost",
        port: config.port ?? 8080,
        uptimeMs: Math.max(0, Date.now() - bootMs),
        rotationMode: resolveRotationMode(accountCount),
        accountCount,
        requestCount: sumRequestCounts(qwenAPI.requestCount),
        streamCount: activity.activeStreams,
      });
    },
  };
}
