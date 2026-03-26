import os from "node:os";
import path from "node:path";

export type RuntimeMode = "packaged" | "development";

export interface RuntimeStoragePathOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  homeDir?: string;
  mode?: RuntimeMode;
}

export interface RuntimeStoragePaths {
  homeDir: string;
  configDir: string;
  logDir: string;
  configFilePath: string;
  stateFilePath: string;
}

const APP_DIR_NAME = "qwen-proxy";

function defaultHomeDir(inputHomeDir?: string): string {
  return inputHomeDir ?? os.homedir();
}

export function resolveRuntimeStoragePaths(options: RuntimeStoragePathOptions = {}): RuntimeStoragePaths {
  const env = options.env ?? process.env;
  const mode = options.mode ?? (env.NODE_ENV === "development" ? "development" : "packaged");
  const cwd = options.cwd ?? process.cwd();
  const home = defaultHomeDir(options.homeDir);

  const resolvedHomeDir = env.QWEN_PROXY_HOME ?? path.join(home, ".local", "share", APP_DIR_NAME);
  const resolvedConfigDir = env.QWEN_PROXY_CONFIG_DIR ?? resolvedHomeDir;
  const modeDefaultLogDir = mode === "development" ? path.join(cwd, "log") : path.join(resolvedHomeDir, "log");
  const resolvedLogDir = env.QWEN_PROXY_LOG_DIR ?? modeDefaultLogDir;

  return {
    homeDir: resolvedHomeDir,
    configDir: resolvedConfigDir,
    logDir: resolvedLogDir,
    configFilePath: path.join(resolvedConfigDir, "config.json"),
    stateFilePath: path.join(resolvedConfigDir, "state.json"),
  };
}
