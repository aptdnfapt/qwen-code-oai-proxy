const fs = require("node:fs") as typeof import("node:fs");
const fsPromises = fs.promises;
const path = require("node:path") as typeof import("node:path");

import { resolveRuntimeStoragePaths } from "../core/config/storage-paths";
import { RUNTIME_LOG_LEVELS, type RuntimeLogLevel } from "../core/types/logging";

type RuntimeConfigStoreLike = {
  getPaths?: () => { logDir: string; configFilePath: string };
  ensureStorage?: () => Promise<void>;
  readConfig?: () => Promise<{ logLevel?: string }>;
  getLogLevel?: () => Promise<RuntimeLogLevel>;
  setLogLevel?: (level: RuntimeLogLevel) => Promise<unknown>;
};

export type LoggingStateSnapshot = {
  level: RuntimeLogLevel;
  liveEnabled: boolean;
  isErrorLogging: boolean;
  isErrorDebugLogging: boolean;
  isDebugLogging: boolean;
  logDir: string;
};

type RuntimeLoggingStatus = {
  currentLogLevel: RuntimeLogLevel;
  persistedLogLevel: RuntimeLogLevel;
  logDir: string;
  configFilePath?: string;
  availableLogLevels: readonly RuntimeLogLevel[];
};

function parseInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function normalizeLogLevel(value: string | undefined, fallback: RuntimeLogLevel): RuntimeLogLevel {
  const lowered = String(value ?? "").toLowerCase();
  if ((RUNTIME_LOG_LEVELS as readonly string[]).includes(lowered)) {
    return lowered as RuntimeLogLevel;
  }

  return fallback;
}

function resolveStartupLogLevel(): RuntimeLogLevel {
  const legacyDebugLog = String(process.env.DEBUG_LOG || "").toLowerCase() === "true";
  return normalizeLogLevel(process.env.LOG_LEVEL || (legacyDebugLog ? "debug" : "error-debug"), "error-debug");
}

class RuntimeLoggingService {
  private runtimeConfigStore: RuntimeConfigStoreLike | null = null;

  private currentLogLevel: RuntimeLogLevel = resolveStartupLogLevel();

  private logDir = resolveRuntimeStoragePaths({ mode: process.env.NODE_ENV === "development" ? "development" : "packaged" }).logDir;

  private configFilePath: string | undefined = resolveRuntimeStoragePaths({ mode: process.env.NODE_ENV === "development" ? "development" : "packaged" }).configFilePath;

  private cleanupStarted = false;

  private consoleEnabled = true;

  attachRuntimeConfigStore(runtimeConfigStore: RuntimeConfigStoreLike | null | undefined): void {
    this.runtimeConfigStore = runtimeConfigStore ?? null;
    const paths = runtimeConfigStore?.getPaths?.();
    if (paths) {
      this.logDir = paths.logDir;
      this.configFilePath = paths.configFilePath;
    }
  }

  async initialize(runtimeConfigStore?: RuntimeConfigStoreLike | null): Promise<RuntimeLoggingStatus> {
    if (runtimeConfigStore !== undefined) {
      this.attachRuntimeConfigStore(runtimeConfigStore);
    }

    if (this.runtimeConfigStore?.ensureStorage) {
      await this.runtimeConfigStore.ensureStorage();
    }

    if (this.runtimeConfigStore?.readConfig) {
      const config = await this.runtimeConfigStore.readConfig();
      this.currentLogLevel = normalizeLogLevel(config?.logLevel, resolveStartupLogLevel());
    }

    await this.ensureLogDir(this.captureState());
    return this.getRuntimeStatus();
  }

  captureState(): LoggingStateSnapshot {
    const level = this.currentLogLevel;
    return {
      level,
      liveEnabled: level !== "off",
      isErrorLogging: level === "error" || level === "error-debug" || level === "debug",
      isErrorDebugLogging: level === "error-debug" || level === "debug",
      isDebugLogging: level === "debug",
      logDir: this.logDir,
    };
  }

  private emitControlLog(message: string): void {
    if (this.currentLogLevel === "off" || !this.consoleEnabled) {
      return;
    }

    console.log(message);
  }

  async setRuntimeLogLevel(level: RuntimeLogLevel, persist = true): Promise<RuntimeLoggingStatus> {
    this.currentLogLevel = normalizeLogLevel(level, this.currentLogLevel);
    await this.ensureLogDir(this.captureState());

    if (persist && this.runtimeConfigStore?.setLogLevel) {
      await this.runtimeConfigStore.setLogLevel(this.currentLogLevel);
    }

    this.emitControlLog(`[LOG] Runtime log level -> ${this.currentLogLevel}${persist ? " (persisted)" : " (memory only)"}`);
    return this.getRuntimeStatus();
  }

  async getRuntimeStatus(): Promise<RuntimeLoggingStatus> {
    let persistedLogLevel = resolveStartupLogLevel();
    if (this.runtimeConfigStore?.getLogLevel) {
      persistedLogLevel = await this.runtimeConfigStore.getLogLevel();
    }

    return {
      currentLogLevel: this.currentLogLevel,
      persistedLogLevel,
      logDir: this.logDir,
      configFilePath: this.configFilePath,
      availableLogLevels: RUNTIME_LOG_LEVELS,
    };
  }

  shouldEmitLive(): boolean {
    return this.captureState().liveEnabled;
  }

  setConsoleEnabled(enabled: boolean): void {
    this.consoleEnabled = enabled;
  }

  getLogDir(): string {
    return this.logDir;
  }

  async ensureLogDir(snapshot: LoggingStateSnapshot): Promise<void> {
    if (!snapshot.isErrorLogging && !snapshot.isDebugLogging) {
      return;
    }

    await fsPromises.mkdir(snapshot.logDir, { recursive: true });
  }

  writeErrorEntry(logEntry: string, snapshot = this.captureState()): void {
    if (!snapshot.isErrorLogging) {
      return;
    }

    const errorLogPath = path.join(snapshot.logDir, "error.log");
    void this.ensureLogDir(snapshot)
      .then(() => fsPromises.appendFile(errorLogPath, logEntry, "utf8"))
      .catch((error: any) => console.error("Failed to write error log:", error.message));
  }

  writeRequestLogContent(requestId: string, content: string, statusCode: number, snapshot = this.captureState()): void {
    if (!snapshot.isDebugLogging && !(snapshot.isErrorDebugLogging && statusCode !== 200)) {
      return;
    }

    const requestDir = path.join(snapshot.logDir, `req-${requestId}`);
    void this.ensureLogDir(snapshot)
      .then(() => fsPromises.mkdir(requestDir, { recursive: true }))
      .then(async () => {
        const sections = content.split("--------------------------\n");

        for (const section of sections) {
          if (!section.trim() || section.startsWith("requestId:")) {
            continue;
          }

          const [title, ...rest] = section.trim().split("\n");
          const data = rest.join("\n").trim();
          if (!data) {
            continue;
          }

          let filename: string | null = null;
          if (title === "INPUT") {
            filename = "client-request.json";
          } else if (title === "TRANSFORMER") {
            filename = "upstream-request.json";
          } else if (title === "OUTPUT") {
            filename = "response.json";
          } else if (title === "ERROR") {
            filename = "error.json";
          }

          if (!filename) {
            continue;
          }

          await fsPromises.writeFile(path.join(requestDir, filename), data, "utf8");
        }
      })
      .catch(() => {});
  }

  writeRequestErrorArtifact(requestId: string, errorData: unknown, statusCode: number, snapshot = this.captureState()): void {
    if (!snapshot.isDebugLogging && !(snapshot.isErrorDebugLogging && statusCode !== 200)) {
      return;
    }

    const requestDir = path.join(snapshot.logDir, `req-${requestId}`);
    const errorFilePath = path.join(requestDir, "error.json");
    void this.ensureLogDir(snapshot)
      .then(() => fsPromises.mkdir(requestDir, { recursive: true }))
      .then(() => fsPromises.writeFile(errorFilePath, JSON.stringify(errorData, null, 2), "utf8"))
      .catch(() => {});
  }

  private async rotateErrorLog(snapshot: LoggingStateSnapshot): Promise<void> {
    const errorLogPath = path.join(snapshot.logDir, "error.log");
    const errorLogMaxMb = parseInteger(process.env.ERROR_LOG_MAX_MB, 10);

    try {
      const stats = await fsPromises.stat(errorLogPath);
      const sizeMb = stats.size / (1024 * 1024);
      if (sizeMb < errorLogMaxMb) {
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedPath = path.join(snapshot.logDir, `error-${timestamp}.log`);
      await fsPromises.rename(errorLogPath, rotatedPath);
      this.emitControlLog(`[LOG] Rotated error.log to error-${timestamp}.log`);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("[LOG] Failed to rotate error.log:", error.message);
      }
    }
  }

  private async cleanupOldErrorLogs(snapshot: LoggingStateSnapshot): Promise<void> {
    const errorLogMaxDays = parseInteger(process.env.ERROR_LOG_MAX_DAYS, 30);
    try {
      const files = await fsPromises.readdir(snapshot.logDir);
      const errorLogs = files.filter((file) => file.startsWith("error-") && file.endsWith(".log"));
      const now = Date.now();
      const maxAge = errorLogMaxDays * 24 * 60 * 60 * 1000;

      for (const file of errorLogs) {
        const filePath = path.join(snapshot.logDir, file);
        const stats = await fsPromises.stat(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          await fsPromises.unlink(filePath);
          this.emitControlLog(`[LOG] Deleted old error log: ${file}`);
        }
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("[LOG] Failed to cleanup old error logs:", error.message);
      }
    }
  }

  private async cleanupOldDebugLogs(snapshot: LoggingStateSnapshot): Promise<void> {
    const maxDebugLogs = parseInteger(process.env.MAX_DEBUG_LOGS || process.env.LOG_FILE_LIMIT, 20);
    try {
      const entries = await fsPromises.readdir(snapshot.logDir, { withFileTypes: true });
      const debugDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("req-"));
      if (debugDirs.length <= maxDebugLogs) {
        return;
      }

      const dirStats: Array<{ name: string; path: string; mtime: Date }> = [];
      for (const dir of debugDirs) {
        const dirPath = path.join(snapshot.logDir, dir.name);
        const stats = await fsPromises.stat(dirPath);
        dirStats.push({ name: dir.name, path: dirPath, mtime: stats.mtime });
      }

      dirStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      for (const dir of dirStats.slice(maxDebugLogs)) {
        await fsPromises.rm(dir.path, { recursive: true, force: true });
        this.emitControlLog(`[LOG] Deleted old debug log directory: ${dir.name}`);
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("[LOG] Failed to cleanup old debug logs:", error.message);
      }
    }
  }

  private async cleanupOldFormatLogs(snapshot: LoggingStateSnapshot): Promise<void> {
    try {
      const files = await fsPromises.readdir(snapshot.logDir);
      const oldFormatLogs = files.filter((file) => file.startsWith("req-") && file.endsWith(".log"));
      for (const file of oldFormatLogs) {
        await fsPromises.unlink(path.join(snapshot.logDir, file));
        this.emitControlLog(`[LOG] Deleted old format log file: ${file}`);
      }
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error("[LOG] Failed to cleanup old format logs:", error.message);
      }
    }
  }

  private async cleanupLogs(): Promise<void> {
    const snapshot = this.captureState();
    if (!snapshot.isErrorLogging && !snapshot.isDebugLogging) {
      return;
    }

    await this.ensureLogDir(snapshot);
    await this.rotateErrorLog(snapshot);
    await this.cleanupOldErrorLogs(snapshot);
    await this.cleanupOldFormatLogs(snapshot);
    await this.cleanupOldDebugLogs(snapshot);
  }

  startCleanupJob(): void {
    if (this.cleanupStarted) {
      return;
    }

    this.cleanupStarted = true;
    const describe = (): string => {
      const snapshot = this.captureState();
      const debugModeDescription = snapshot.isDebugLogging ? "full" : (snapshot.isErrorDebugLogging ? "non-200 only" : "off");
      return `[LOG] Logging mode=${snapshot.level}, debug=${debugModeDescription} - dir: ${snapshot.logDir}`;
    };

    this.emitControlLog(describe());
    setInterval(() => {
      void this.cleanupLogs().catch((error: any) => console.error("[LOG] Cleanup job error:", error.message));
    }, 3600000);

    setTimeout(() => {
      void this.cleanupLogs();
    }, 5000);
  }
}

export const runtimeLoggingService = new RuntimeLoggingService();
