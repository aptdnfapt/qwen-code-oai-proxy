import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveRuntimeStoragePaths, type RuntimeStoragePathOptions, type RuntimeStoragePaths } from "./storage-paths";
import { RUNTIME_LOG_LEVELS, type RuntimeLogLevel } from "../types/logging";

export interface RuntimeConfig {
  logLevel: RuntimeLogLevel;
  updatedAt: string;
}

export interface RuntimeState {
  lastActiveTab?: string;
  lastSelectedAccount?: string;
  updatedAt: string;
}

export interface RuntimeConfigStoreOptions extends RuntimeStoragePathOptions {
  fallbackLogLevel?: RuntimeLogLevel;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeLogLevel(value: string | undefined, fallback: RuntimeLogLevel): RuntimeLogLevel {
  if (!value) {
    return fallback;
  }

  const lowered = value.toLowerCase();
  if ((RUNTIME_LOG_LEVELS as readonly string[]).includes(lowered)) {
    return lowered as RuntimeLogLevel;
  }

  return fallback;
}

export class RuntimeConfigStore {
  private readonly paths: RuntimeStoragePaths;

  private readonly fallbackLogLevel: RuntimeLogLevel;

  private readonly env: NodeJS.ProcessEnv;

  constructor(options: RuntimeConfigStoreOptions = {}) {
    this.paths = resolveRuntimeStoragePaths(options);
    this.env = options.env ?? process.env;
    this.fallbackLogLevel = options.fallbackLogLevel ?? "error-debug";
  }

  getPaths(): RuntimeStoragePaths {
    return this.paths;
  }

  async ensureStorage(): Promise<void> {
    await mkdir(this.paths.configDir, { recursive: true });
    await mkdir(this.paths.logDir, { recursive: true });
  }

  resolveStartupLogLevel(): RuntimeLogLevel {
    const legacyDebugLog = String(this.env.DEBUG_LOG || "").toLowerCase() === "true";
    return normalizeLogLevel(this.env.LOG_LEVEL || (legacyDebugLog ? "debug" : undefined), this.fallbackLogLevel);
  }

  async readConfig(): Promise<RuntimeConfig> {
    await this.ensureStorage();

    const defaultConfig: RuntimeConfig = {
      logLevel: this.resolveStartupLogLevel(),
      updatedAt: nowIso(),
    };

    let raw: string;
    try {
      raw = await readFile(this.paths.configFilePath, "utf8");
    } catch {
      return defaultConfig;
    }

    const parsed = parseJson<Partial<RuntimeConfig>>(raw);
    if (!parsed) {
      return defaultConfig;
    }

    return {
      logLevel: normalizeLogLevel(parsed.logLevel, defaultConfig.logLevel),
      updatedAt: parsed.updatedAt ?? defaultConfig.updatedAt,
    };
  }

  async writeConfig(input: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
    const current = await this.readConfig();
    const next: RuntimeConfig = {
      logLevel: normalizeLogLevel(input.logLevel, current.logLevel),
      updatedAt: nowIso(),
    };

    await writeFile(this.paths.configFilePath, JSON.stringify(next, null, 2), "utf8");
    return next;
  }

  async getLogLevel(): Promise<RuntimeLogLevel> {
    const config = await this.readConfig();
    return config.logLevel;
  }

  async setLogLevel(level: RuntimeLogLevel): Promise<RuntimeConfig> {
    return this.writeConfig({ logLevel: level });
  }

  async readState(): Promise<RuntimeState> {
    await this.ensureStorage();

    const defaultState: RuntimeState = {
      updatedAt: nowIso(),
    };

    let raw: string;
    try {
      raw = await readFile(this.paths.stateFilePath, "utf8");
    } catch {
      return defaultState;
    }

    const parsed = parseJson<Partial<RuntimeState>>(raw);
    if (!parsed) {
      return defaultState;
    }

    return {
      lastActiveTab: parsed.lastActiveTab,
      lastSelectedAccount: parsed.lastSelectedAccount,
      updatedAt: parsed.updatedAt ?? defaultState.updatedAt,
    };
  }

  async writeState(input: Partial<RuntimeState>): Promise<RuntimeState> {
    const current = await this.readState();
    const next: RuntimeState = {
      ...current,
      ...input,
      updatedAt: nowIso(),
    };

    await writeFile(this.paths.stateFilePath, JSON.stringify(next, null, 2), "utf8");
    return next;
  }
}
