import { exit } from "process";
import { createRequire } from "module";
import chalk from "chalk";
import { ProcessTerminal, TUI } from "@mariozechner/pi-tui";
import { createInitialState, reduceTuiState } from "./state.js";
import { createRuntimeMonitor } from "./runtime.js";
import type { ArtifactNode, LogLevel, TuiAction, TuiState } from "./types.js";
import { AppView } from "./app.js";
import { enableMouse, disableMouse } from "./mouse.js";
import { enableConsoleRedirect, disableConsoleRedirect } from "./console-redirect.js";

const require = createRequire(import.meta.url);
const qrcode = require("qrcode-terminal") as {
  generate: (text: string, options: { small?: boolean }, cb: (qr: string) => void) => void;
};
const openUrl = require("open") as (target: string) => Promise<unknown>;
const liveLogger = require("../utils/liveLogger.js") as {
  subscribe: (listener: (entry: { timestamp: number; message: string }) => void) => () => void;
  getRecentEntries: (limit?: number) => readonly { timestamp: number; message: string }[];
  setConsoleEnabled: (enabled: boolean) => void;
};
const fileLogger = require("../utils/fileLogger.js") as {
  setConsoleEnabled: (enabled: boolean) => void;
};

const TICK_MS = 1000;
const ANSI_RE = /\x1b[\x20-\x2f]*[\x40-\x7e]|\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b[\x40-\x5f][^\x1b]*/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "").replace(/[\r\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
}

function renderQrText(text: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(text, { small: true }, (qr) => resolve(qr));
  });
}

let currentState: TuiState = createInitialState();
const runtimeMonitor = createRuntimeMonitor(currentState.bootMs);

const terminal = new ProcessTerminal();
const tui = new TUI(terminal);

let stopping = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let authRunId = 0;
let unsubscribeLiveLogs: (() => void) | null = null;

function appendLog(level: "info" | "warn" | "error" | "debug", message: string, formattedMessage?: string, timestamp = Date.now()): void {
  dispatch({
    type: "append-log",
    entry: {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      level,
      message,
      formattedMessage,
      source: "tui",
    },
  });
}

function handleRedirectedConsoleLog(level: "info" | "warn" | "error" | "debug", message: string): void {
  appendLog(level, message);
}

function appendClassicLog(level: "info" | "warn" | "error" | "debug", symbol: string, label: string, detail: string): void {
  const icon = level === "error" ? chalk.red(symbol) : level === "warn" ? chalk.yellow(symbol) : chalk.cyan(symbol);
  const formatted = `${icon} ${chalk.white(label)} | ${detail}`;
  appendLog(level, `${label} | ${stripAnsi(detail)}`, formatted);
}

function classifyLogLine(message: string): "info" | "warn" | "error" | "debug" {
  if (message.startsWith("✗")) return "error";
  if (message.startsWith("↻") || message.startsWith("■")) return "warn";
  if (message.startsWith("[LOG]")) return "debug";
  return "info";
}

function artifactExists(tree: readonly ArtifactNode[], target: string): boolean {
  for (const node of tree) {
    if (node.path === target) {
      return true;
    }
    if (node.children && artifactExists(node.children, target)) {
      return true;
    }
  }

  return false;
}

let appView!: AppView;

function dispatch(action: TuiAction): void {
  currentState = reduceTuiState(currentState, action);
  appView?.setState(currentState);
  tui.requestRender(true);
}

async function stopApp(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  disableMouse((s) => terminal.write(s));
  try {
    unsubscribeLiveLogs?.();
    unsubscribeLiveLogs = null;
    liveLogger.setConsoleEnabled(true);
    fileLogger.setConsoleEnabled(true);
    disableConsoleRedirect();
    await runtimeMonitor.dispose();
    tui.stop();
  } catch {}
  exit(0);
}

async function refreshRuntimeSummary(): Promise<void> {
  try {
    const runtime = await runtimeMonitor.refresh();
    dispatch({ type: "set-runtime", runtime });
  } catch (e: any) {
    appendLog("error", `Runtime refresh: ${String(e?.message ?? e)}`);
  }
}

async function refreshAccounts(selectedId?: string | null): Promise<void> {
  const accounts = await runtimeMonitor.loadAccounts();
  dispatch({ type: "set-accounts", accounts });
  if (selectedId && accounts.some((a) => a.id === selectedId)) {
    dispatch({ type: "select-account", id: selectedId });
  }
}

async function refreshUsage(): Promise<void> {
  const days = await runtimeMonitor.loadUsage();
  dispatch({ type: "set-usage-days", days });
}

async function refreshArtifacts(): Promise<void> {
  try {
    const tree = await runtimeMonitor.loadArtifacts();
    const selectedBefore = currentState.artifacts.selected;
    dispatch({ type: "set-artifacts-tree", tree });
    const selected = currentState.artifacts.selected;

    if (!selected || !artifactExists(tree, selected)) {
      dispatch({ type: "set-artifact-preview", content: null });
      return;
    }

    const preview = await runtimeMonitor.loadArtifactPreview(selected);
    dispatch({ type: "set-artifact-preview", content: preview });
    if (selectedBefore !== selected && !preview) {
      dispatch({ type: "set-artifact-preview", content: null });
    }
  } catch (e: any) {
    appendClassicLog("error", "✗", "Artifacts", String(e?.message ?? e));
  }
}

async function handleStartServer(): Promise<void> {
  appendClassicLog("info", "●", "Server", "start requested");
  try {
    const runtime = await runtimeMonitor.startServer();
    dispatch({ type: "set-runtime", runtime });
    await refreshArtifacts();
  } catch (e: any) {
    appendClassicLog("error", "✗", "Server", `start failed: ${String(e?.message ?? e)}`);
    await refreshRuntimeSummary();
  }
}

async function handleStopServer(): Promise<void> {
  appendClassicLog("warn", "■", "Server", "stop requested");
  try {
    const runtime = await runtimeMonitor.stopServer();
    dispatch({ type: "set-runtime", runtime });
    appendClassicLog("warn", "■", "Server", "stopped");
  } catch (e: any) {
    appendClassicLog("error", "✗", "Server", `stop failed: ${String(e?.message ?? e)}`);
    await refreshRuntimeSummary();
  }
}

async function handleRestartServer(): Promise<void> {
  appendClassicLog("warn", "↻", "Server", "restart requested");
  try {
    const runtime = await runtimeMonitor.restartServer();
    dispatch({ type: "set-runtime", runtime });
    await refreshArtifacts();
  } catch (e: any) {
    appendClassicLog("error", "✗", "Server", `restart failed: ${String(e?.message ?? e)}`);
    await refreshRuntimeSummary();
  }
}

async function handleLogLevelChange(level: LogLevel): Promise<void> {
  dispatch({ type: "set-log-level", level });
  try {
    const runtime = await runtimeMonitor.setLogLevel(level);
    dispatch({ type: "set-runtime", runtime });
    appendClassicLog("info", "↻", "Log", `level ${level}`);
  } catch (e: any) {
    appendClassicLog("error", "✗", "Log", `change failed: ${String(e?.message ?? e)}`);
  }
}

async function handleStartAccountAuth(): Promise<void> {
  const accountId = currentState.accounts.authModal.accountId.trim();
  if (!accountId || !/^[a-zA-Z0-9._-]+$/.test(accountId)) {
    dispatch({ type: "auth-failure", message: "Invalid account ID. Use letters, numbers, dot, dash, underscore." });
    return;
  }

  const runId = ++authRunId;
  dispatch({ type: "auth-start", message: "Requesting device code..." });
  appendClassicLog("info", "✓", "Auth", `starting ${accountId}`);

  try {
    const flow = await runtimeMonitor.initiateAddAccountFlow();
    const qrText = await renderQrText(flow.verificationUriComplete);
    if (runId !== authRunId) return;

    dispatch({
      type: "auth-device-flow-ready",
      message: "Scan QR or open link, then approve in browser.",
      flow: {
        verificationUri: flow.verificationUri,
        verificationUriComplete: flow.verificationUriComplete,
        userCode: flow.userCode,
        deviceCode: flow.deviceCode,
        codeVerifier: flow.codeVerifier,
        qrText,
      },
    });

    await runtimeMonitor.completeAddAccountFlow(flow.deviceCode, flow.codeVerifier, accountId);
    if (runId !== authRunId) return;

    await Promise.all([refreshAccounts(accountId), refreshRuntimeSummary(), refreshArtifacts()]);
    dispatch({ type: "auth-success", message: `Account ${accountId} added.` });
    appendClassicLog("info", "✓", "Auth", `account ${accountId} added`);
  } catch (e: any) {
    if (runId !== authRunId) return;
    const msg = e instanceof Error ? e.message : String(e);
    dispatch({ type: "auth-failure", message: msg });
    appendClassicLog("error", "✗", "Auth", msg);
  }
}

async function loadServerConfig(): Promise<void> {
  try {
    const fileLogger = require("../utils/fileLogger.js") as { getRuntimeStatus: () => Promise<{ currentLogLevel?: string }> };
    const { RuntimeConfigStore } = require("../core/config/runtime-config-store.js") as typeof import("../core/config/runtime-config-store.js");
    const store = new RuntimeConfigStore();
    const sc = await store.getServerConfig();
    dispatch({
      type: "set-server-config",
      port: sc.port ?? 8080,
      host: sc.host ?? "localhost",
      autoStart: sc.autoStart,
    });
  } catch (e: any) {
    appendClassicLog("warn", "■", "Config", `load failed: ${String(e?.message ?? e)}`);
  }
}

async function handleServerConfigChange(port: number, host: string, autoStart: boolean): Promise<void> {
  dispatch({ type: "set-server-config", port, host, autoStart });
  try {
    const { RuntimeConfigStore } = require("../core/config/runtime-config-store.js") as typeof import("../core/config/runtime-config-store.js");
    const store = new RuntimeConfigStore();
    await store.setServerConfig({ port, host, autoStart });
    appendClassicLog("info", "✓", "Config", `saved port=${port} host=${host} autoStart=${autoStart}`);
  } catch (e: any) {
    appendClassicLog("error", "✗", "Config", `save failed: ${String(e?.message ?? e)}`);
  }
}

async function handleDeleteAccount(accountId: string): Promise<void> {
  dispatch({ type: "close-delete-modal" });
  try {
    await runtimeMonitor.deleteAccount(accountId);
    appendClassicLog("info", "✓", "Account", `deleted ${accountId}`);
    await Promise.all([refreshAccounts(), refreshRuntimeSummary()]);
  } catch (e: any) {
    appendClassicLog("error", "✗", "Account", `delete failed: ${String(e?.message ?? e)}`);
  }
}

async function handleOpenAuthBrowser(): Promise<void> {
  const url = currentState.accounts.authModal.flow?.verificationUriComplete;
  if (!url) {
    appendClassicLog("warn", "■", "Auth", "browser link not ready yet");
    return;
  }

  try {
    await openUrl(url);
    appendClassicLog("info", "✓", "Auth", "browser opened");
  } catch (e: any) {
    appendClassicLog("error", "✗", "Auth", `open failed: ${String(e?.message ?? e)}`);
  }
}

appView = new AppView(tui, currentState, {
  dispatch,
  onQuit: () => { void stopApp(); },
  onStartServer: () => { void handleStartServer(); },
  onStopServer: () => { void handleStopServer(); },
  onRestartServer: () => { void handleRestartServer(); },
  onLogLevelChange: (level) => { void handleLogLevelChange(level); },
  onAddAccount: () => { dispatch({ type: "open-auth-modal" }); },
  onOpenAuthBrowser: () => { void handleOpenAuthBrowser(); },
  onCloseAuthModal: () => {
    authRunId++;
    dispatch({ type: "close-auth-modal" });
  },
  onAuthAccountIdChange: (id) => { dispatch({ type: "set-auth-account-id", accountId: id }); },
  onStartAccountAuth: () => { void handleStartAccountAuth(); },
  onSelectAccount: (id) => { dispatch({ type: "select-account", id }); },
  onDeleteAccount: (id) => { void handleDeleteAccount(id); },
  onSelectUsageDate: (date) => { dispatch({ type: "select-usage-date", date }); },
  onUsageFilterChange: (value) => { dispatch({ type: "set-usage-filter", value }); },
  onToggleArtifactExpand: (path) => {
    dispatch({ type: "toggle-artifact-expand", path });
    void refreshArtifacts();
  },
  onSelectArtifact: (path) => {
    dispatch({ type: "select-artifact", path });
    void (async () => {
      const preview = path ? await runtimeMonitor.loadArtifactPreview(path) : null;
      dispatch({ type: "set-artifact-preview", content: preview });
    })();
  },
  onThemeChange: (theme) => { dispatch({ type: "set-theme", theme }); },
  onServerConfigChange: (port, host, autoStart) => { void handleServerConfigChange(port, host, autoStart); },
});

tui.addChild(appView);
tui.setFocus(appView);

process.on("resize", () => {
  dispatch({
    type: "set-viewport",
    cols: process.stdout.columns ?? currentState.viewportCols,
    rows: process.stdout.rows ?? currentState.viewportRows,
  });
});

tickTimer = setInterval(() => {
  dispatch({ type: "tick", nowMs: Date.now() });
  dispatch({
    type: "set-viewport",
    cols: process.stdout.columns ?? currentState.viewportCols,
    rows: process.stdout.rows ?? currentState.viewportRows,
  });
  void refreshRuntimeSummary();
  void refreshUsage();
  void refreshAccounts();
  if (currentState.activeScreen === "artifacts") {
    void refreshArtifacts();
  }
}, TICK_MS);

liveLogger.setConsoleEnabled(false);
fileLogger.setConsoleEnabled(false);
enableConsoleRedirect(handleRedirectedConsoleLog);
for (const entry of liveLogger.getRecentEntries(200)) {
  const stripped = stripAnsi(entry.message);
  if (stripped) {
    appendLog(classifyLogLine(stripped), stripped, entry.message, entry.timestamp);
  }
}
unsubscribeLiveLogs = liveLogger.subscribe((entry) => {
  const stripped = stripAnsi(entry.message);
  if (stripped) {
    appendLog(classifyLogLine(stripped), stripped, entry.message, entry.timestamp);
  }
});

tui.start();

enableMouse((s) => terminal.write(s));

await Promise.all([refreshRuntimeSummary(), refreshAccounts(), refreshUsage(), refreshArtifacts(), loadServerConfig()]);

if (currentState.serverConfig.autoStart) {
  appendClassicLog("info", "●", "Server", "auto-start enabled — starting...");
  void handleStartServer();
}
