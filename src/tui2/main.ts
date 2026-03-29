import { exit } from "process";
import { createRequire } from "module";
import { ProcessTerminal, TUI } from "@mariozechner/pi-tui";
import { createInitialState, reduceTuiState } from "./state.js";
import { createRuntimeMonitor } from "./runtime.js";
import type { LogLevel, TuiAction, TuiState } from "./types.js";
import { AppView } from "./app.js";
import { enableMouse, disableMouse } from "./mouse.js";

const require = createRequire(import.meta.url);
const qrcode = require("qrcode-terminal") as {
  generate: (text: string, options: { small?: boolean }, cb: (qr: string) => void) => void;
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

function appendLog(level: "info" | "warn" | "error" | "debug", message: string): void {
  dispatch({
    type: "append-log",
    entry: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      level,
      message,
      source: "tui",
    },
  });
}

const pendingLines: Array<{ level: "info" | "warn" | "error"; message: string }> = [];
let flushScheduled = false;

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    for (const { level, message } of pendingLines.splice(0)) {
      try { appendLog(level, message); } catch {}
    }
  });
}

function installStdoutCapture(): void {
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  const realStderrWrite = process.stderr.write.bind(process.stderr);
  let outBuf = "", errBuf = "";

  function interceptWrite(
    getBuf: () => string,
    setBuf: (s: string) => void,
    level: "info" | "error",
    realWrite: typeof process.stdout.write,
  ) {
    return (chunk: string | Buffer, enc?: unknown, cb?: unknown): boolean => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      const buf = getBuf() + text;
      const parts = buf.split("\n");
      for (let i = 0; i < parts.length - 1; i++) {
        const msg = stripAnsi(parts[i]!);
        if (msg) pendingLines.push({ level, message: msg });
      }
      setBuf(parts[parts.length - 1]!);
      scheduleFlush();
      if (typeof cb === "function") (cb as () => void)();
      return true;
    };
  }

  (process.stdout.write as any) = interceptWrite(() => outBuf, (s) => { outBuf = s; }, "info", realStdoutWrite);
  (process.stderr.write as any) = interceptWrite(() => errBuf, (s) => { errBuf = s; }, "error", realStderrWrite);
}

let appView!: AppView;

function dispatch(action: TuiAction): void {
  currentState = reduceTuiState(currentState, action);
  appView?.setState(currentState);
  tui.requestRender();
}

async function stopApp(): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  disableMouse((s) => terminal.write(s));
  try {
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

async function handleStartServer(): Promise<void> {
  appendLog("info", "Starting proxy server...");
  try {
    const runtime = await runtimeMonitor.startServer();
    dispatch({ type: "set-runtime", runtime });
    appendLog("info", `Server running on http://${runtime.host}:${String(runtime.port)}`);
  } catch (e: any) {
    appendLog("error", `Start failed: ${String(e?.message ?? e)}`);
    await refreshRuntimeSummary();
  }
}

async function handleStopServer(): Promise<void> {
  appendLog("warn", "Stopping proxy server...");
  try {
    const runtime = await runtimeMonitor.stopServer();
    dispatch({ type: "set-runtime", runtime });
    appendLog("info", "Server stopped");
  } catch (e: any) {
    appendLog("error", `Stop failed: ${String(e?.message ?? e)}`);
    await refreshRuntimeSummary();
  }
}

async function handleRestartServer(): Promise<void> {
  appendLog("warn", "Restarting proxy server...");
  try {
    const runtime = await runtimeMonitor.restartServer();
    dispatch({ type: "set-runtime", runtime });
    appendLog("info", `Server restarted on http://${runtime.host}:${String(runtime.port)}`);
  } catch (e: any) {
    appendLog("error", `Restart failed: ${String(e?.message ?? e)}`);
    await refreshRuntimeSummary();
  }
}

async function handleLogLevelChange(level: LogLevel): Promise<void> {
  dispatch({ type: "set-log-level", level });
  try {
    const runtime = await runtimeMonitor.setLogLevel(level);
    dispatch({ type: "set-runtime", runtime });
    appendLog("info", `Log level → ${level}`);
  } catch (e: any) {
    appendLog("error", `Log level change failed: ${String(e?.message ?? e)}`);
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
  appendLog("info", `Starting auth for ${accountId}`);

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

    await Promise.all([refreshAccounts(accountId), refreshRuntimeSummary()]);
    dispatch({ type: "auth-success", message: `Account ${accountId} added.` });
    appendLog("info", `Account ${accountId} authenticated`);
  } catch (e: any) {
    if (runId !== authRunId) return;
    const msg = e instanceof Error ? e.message : String(e);
    dispatch({ type: "auth-failure", message: msg });
    appendLog("error", `Auth failed: ${msg}`);
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
  onOpenAuthBrowser: () => {},
  onCloseAuthModal: () => {
    authRunId++;
    dispatch({ type: "close-auth-modal" });
  },
  onAuthAccountIdChange: (id) => { dispatch({ type: "set-auth-account-id", accountId: id }); },
  onStartAccountAuth: () => { void handleStartAccountAuth(); },
  onSelectAccount: (id) => { dispatch({ type: "select-account", id }); },
  onSelectUsageDate: (date) => { dispatch({ type: "select-usage-date", date }); },
  onUsageFilterChange: (value) => { dispatch({ type: "set-usage-filter", value }); },
  onToggleArtifactExpand: (path) => { dispatch({ type: "toggle-artifact-expand", path }); },
  onSelectArtifact: (path) => { dispatch({ type: "select-artifact", path }); },
  onThemeChange: (theme) => { dispatch({ type: "set-theme", theme }); },
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
}, TICK_MS);

tui.start();

enableMouse((s) => terminal.write(s));

await Promise.all([refreshRuntimeSummary(), refreshAccounts(), refreshUsage()]);
