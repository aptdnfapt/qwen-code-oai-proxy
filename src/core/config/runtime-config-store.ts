import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveRuntimeStoragePaths, type RuntimeStoragePathOptions, type RuntimeStoragePaths } from "./storage-paths";
import { RUNTIME_LOG_LEVELS, type RuntimeLogLevel } from "../types/logging";

export interface RuntimeConfig {
  logLevel: RuntimeLogLevel;
  port?: number;
  host?: string;
  autoStart?: boolean;
  theme?: string;
  selectionStyle?: string;
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

const TUI_THEME_NAMES = ["dark", "light", "amber", "contrast"] as const;
const TUI_SELECTION_STYLE_NAMES = ["solid", "transparent"] as const;

function normalizeTheme(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return (TUI_THEME_NAMES as readonly string[]).includes(value) ? value : undefined;
}

function normalizeSelectionStyle(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return (TUI_SELECTION_STYLE_NAMES as readonly string[]).includes(value) ? value : undefined;
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
      port: typeof parsed.port === "number" && parsed.port > 0 ? parsed.port : undefined,
      host: typeof parsed.host === "string" && parsed.host.length > 0 ? parsed.host : undefined,
      autoStart: typeof parsed.autoStart === "boolean" ? parsed.autoStart : undefined,
      theme: normalizeTheme(parsed.theme),
      selectionStyle: normalizeSelectionStyle(parsed.selectionStyle),
      updatedAt: parsed.updatedAt ?? defaultConfig.updatedAt,
    };
  }

  async writeConfig(input: Partial<RuntimeConfig>): Promise<RuntimeConfig> {
    const current = await this.readConfig();
    const next: RuntimeConfig = {
      logLevel: normalizeLogLevel(input.logLevel, current.logLevel),
      port: input.port !== undefined ? input.port : current.port,
      host: input.host !== undefined ? input.host : current.host,
      autoStart: input.autoStart !== undefined ? input.autoStart : current.autoStart,
      theme: input.theme !== undefined ? (normalizeTheme(input.theme) ?? current.theme) : current.theme,
      selectionStyle: input.selectionStyle !== undefined ? (normalizeSelectionStyle(input.selectionStyle) ?? current.selectionStyle) : current.selectionStyle,
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

  async getServerConfig(): Promise<{ port: number | undefined; host: string | undefined; autoStart: boolean }> {
    const config = await this.readConfig();
    return {
      port: config.port,
      host: config.host,
      autoStart: config.autoStart ?? false,
    };
  }

  async setServerConfig(input: { port?: number; host?: string; autoStart?: boolean }): Promise<RuntimeConfig> {
    return this.writeConfig(input);
  }

  async getTuiPreferences(): Promise<{ theme: string | undefined; selectionStyle: string | undefined }> {
    const config = await this.readConfig();
    return {
      theme: config.theme,
      selectionStyle: config.selectionStyle,
    };
  }

  async setTuiPreferences(input: { theme?: string; selectionStyle?: string }): Promise<RuntimeConfig> {
    return this.writeConfig(input);
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
