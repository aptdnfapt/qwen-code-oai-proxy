import { exit } from "process";
import { createRequire } from "module";
import { createNodeApp } from "@rezi-ui/node";
import { createKeybindingMap } from "./helpers/keybindings.js";
import { createRuntimeMonitor } from "./helpers/runtime.js";
import { createInitialState, reduceTuiState } from "./helpers/state.js";
import { createTuiRoutes } from "./screens/index.js";
import { themeSpec } from "./theme.js";
import {
  NAV_ITEMS,
  type IconMode,
  type LogLevel,
  type ScreenId,
  type SidebarMode,
  type ThemeName,
  type TuiAction,
  type TuiState,
} from "./types.js";

const UI_FPS_CAP = 30;
const TICK_MS = 1000;
const initialState = createInitialState();
const runtimeMonitor = createRuntimeMonitor(initialState.bootMs);
const require = createRequire(import.meta.url);
const qrcode = require("qrcode-terminal") as {
  generate: (text: string, options: { small?: boolean }, callback: (qrText: string) => void) => void;
};

let app!: ReturnType<typeof createNodeApp<TuiState>>;
let currentState: TuiState = initialState;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let resizeCleanup: (() => void) | null = null;
let authRunId = 0;

function renderQrText(text: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(text, { small: true }, (qrText: string) => resolve(qrText));
  });
}

function validateAccountId(accountId: string): string | null {
  if (accountId.length === 0) {
    return "Account ID is required.";
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(accountId)) {
    return "Use only letters, numbers, dot, dash, underscore.";
  }

  return null;
}

function appendSystemLog(level: "info" | "warn" | "error" | "debug", message: string): void {
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

function dispatch(action: TuiAction): void {
  let nextTheme = initialState.themeName;
  let themeChanged = false;

  app.update((previous) => {
    const next = reduceTuiState(previous, action);
    nextTheme = next.themeName;
    themeChanged = nextTheme !== previous.themeName;
    currentState = next;
    return next;
  });

  if (themeChanged) {
    app.setTheme(themeSpec(nextTheme).theme);
  }
}

async function stopApp(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }

  if (resizeCleanup) {
    resizeCleanup();
    resizeCleanup = null;
  }

  try {
    await runtimeMonitor.dispose();
    await app.stop();
  } catch {
    // Ignore stop races.
  }

  app.dispose();
  exit(0);
}

function navigate(screen: ScreenId): void {
  dispatch({ type: "navigate", screen });

  const router = app.router;
  if (!router) {
    return;
  }

  const current = router.currentRoute();
  if (current.id !== screen) {
    router.navigate(screen);
  }
}

async function refreshRuntimeSummary(): Promise<void> {
  const runtime = await runtimeMonitor.refresh();
  dispatch({ type: "set-runtime", runtime });
}

async function refreshAccounts(selectedId?: string | null): Promise<void> {
  const accounts = await runtimeMonitor.loadAccounts();
  dispatch({ type: "set-accounts", accounts });

  if (selectedId && accounts.some((account) => account.id === selectedId)) {
    dispatch({ type: "select-account", id: selectedId });
  }
}

async function refreshUsage(): Promise<void> {
  const days = await runtimeMonitor.loadUsage();
  dispatch({ type: "set-usage-days", days });
}

function openAuthModal(): void {
  dispatch({ type: "open-auth-modal" });
}

function closeAuthModal(): void {
  authRunId += 1;
  dispatch({ type: "close-auth-modal" });
}

async function handleStartAccountAuth(): Promise<void> {
  const accountId = currentState.accounts.authModal.accountId.trim();
  const validationError = validateAccountId(accountId);

  if (validationError) {
    dispatch({ type: "auth-failure", message: validationError });
    return;
  }

  const runId = authRunId + 1;
  authRunId = runId;
  dispatch({ type: "auth-start", message: "Requesting device code..." });
  appendSystemLog("info", `Starting auth flow for ${accountId}`);

  try {
    const flow = await runtimeMonitor.initiateAddAccountFlow();
    const qrText = await renderQrText(flow.verificationUriComplete);

    if (runId !== authRunId) {
      return;
    }

    dispatch({
      type: "auth-device-flow-ready",
      message: "Open link or scan QR, then approve in browser.",
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

    if (runId !== authRunId) {
      return;
    }

    await Promise.all([refreshAccounts(accountId), refreshRuntimeSummary()]);
    dispatch({ type: "auth-success", message: `Account ${accountId} added.` });
    dispatch({ type: "select-account", id: accountId });
    appendSystemLog("info", `Account ${accountId} authenticated`);
  } catch (error: any) {
    if (runId !== authRunId) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    dispatch({ type: "auth-failure", message });
    appendSystemLog("error", `Account auth failed: ${message}`);
  }
}

async function handleStartServer(): Promise<void> {
  try {
    appendSystemLog("info", "Starting proxy server...");
    const runtime = await runtimeMonitor.startServer();
    dispatch({ type: "set-runtime", runtime });
    appendSystemLog("info", `Server running on http://${runtime.host}:${String(runtime.port)}`);
  } catch (error: any) {
    appendSystemLog("error", `Start failed: ${error.message}`);
    await refreshRuntimeSummary();
  }
}

async function handleStopServer(): Promise<void> {
  try {
    appendSystemLog("warn", "Stopping proxy server...");
    const runtime = await runtimeMonitor.stopServer();
    dispatch({ type: "set-runtime", runtime });
    appendSystemLog("info", "Server stopped");
  } catch (error: any) {
    appendSystemLog("error", `Stop failed: ${error.message}`);
    await refreshRuntimeSummary();
  }
}

async function handleRestartServer(): Promise<void> {
  try {
    appendSystemLog("warn", "Restarting proxy server...");
    const runtime = await runtimeMonitor.restartServer();
    dispatch({ type: "set-runtime", runtime });
    appendSystemLog("info", `Server restarted on http://${runtime.host}:${String(runtime.port)}`);
  } catch (error: any) {
    appendSystemLog("error", `Restart failed: ${error.message}`);
    await refreshRuntimeSummary();
  }
}

async function handleRuntimeLogLevelChange(level: LogLevel): Promise<void> {
  dispatch({ type: "set-log-level", level });

  try {
    const runtime = await runtimeMonitor.setLogLevel(level);
    dispatch({ type: "set-runtime", runtime });
    appendSystemLog("info", `Runtime log level -> ${level}`);
  } catch (error: any) {
    appendSystemLog("error", `Log level change failed: ${error.message}`);
  }
}

function installResizeHook(): void {
  const onResize = (): void => {
    dispatch({
      type: "set-viewport",
      cols: process.stdout.columns ?? initialState.viewportCols,
      rows: process.stdout.rows ?? initialState.viewportRows,
    });
  };

  process.stdout.on("resize", onResize);
  resizeCleanup = () => {
    process.stdout.off("resize", onResize);
  };
}

app = createNodeApp({
  initialState,
  routes: createTuiRoutes({
    onNavigate: navigate,
    onToggleSidebar: () => dispatch({ type: "toggle-sidebar" }),
    // Live screen callbacks
    onStartServer: () => {
      void handleStartServer();
    },
    onStopServer: () => {
      void handleStopServer();
    },
    onRestartServer: () => {
      void handleRestartServer();
    },
    onLogLevelChange: (level: LogLevel) => {
      void handleRuntimeLogLevelChange(level);
    },
    onLogsScroll: (scrollTop: number) => dispatch({ type: "set-logs-scroll", scrollTop }),
    // Artifacts screen callbacks
    onToggleArtifactExpand: (path: string) => dispatch({ type: "toggle-artifact-expand", path }),
    onSelectArtifact: (path: string | null) => dispatch({ type: "select-artifact", path }),
    onActivateArtifact: (_path: string) => {
      // TODO: Load preview content for activated artifact
    },
    // Accounts screen callbacks
    onSelectAccount: (id: string | null) => dispatch({ type: "select-account", id }),
    onAddAccount: openAuthModal,
    onCloseAuthModal: closeAuthModal,
    onAuthAccountIdChange: (accountId: string) => dispatch({ type: "set-auth-account-id", accountId }),
    onStartAccountAuth: () => {
      void handleStartAccountAuth();
    },
    onRefreshAccount: (_id: string) => {
      // TODO: Refresh account credentials
    },
    onRemoveAccount: (_id: string) => {
      // TODO: Remove account with confirmation
    },
    // Usage screen callbacks
    onSelectUsageDate: (date: string | null) => dispatch({ type: "select-usage-date", date }),
    onUsageFilterChange: (value: string) => dispatch({ type: "set-usage-filter", value }),
    // Settings screen callbacks
    onThemeChange: (theme: ThemeName) => {
      dispatch({ type: "cycle-theme" });
      // Only cycle if different from target
      if (currentState.themeName !== theme) {
        dispatch({ type: "cycle-theme" });
      }
    },
    onSidebarModeChange: (_mode: SidebarMode) => dispatch({ type: "toggle-sidebar" }),
    onIconModeChange: (_mode: IconMode) => dispatch({ type: "toggle-icon-mode" }),
    onDefaultLogLevelChange: (level: LogLevel) => {
      void handleRuntimeLogLevelChange(level);
    },
  }),
  initialRoute: initialState.activeScreen,
  config: {
    fpsCap: UI_FPS_CAP,
  },
  theme: themeSpec(initialState.themeName).theme,
});

app.keys(
  createKeybindingMap({
    dispatch,
    onQuit: () => {
      dispatch({ type: "request-quit" });
      void stopApp();
    },
    onNavigate: navigate,
    onOpenAuthModal: openAuthModal,
    getFocusRegion: () => currentState.focusRegion,
    getActiveScreen: () => currentState.activeScreen,
  }),
);

installResizeHook();

tickTimer = setInterval(() => {
  dispatch({ type: "tick", nowMs: Date.now() });
  dispatch({
    type: "set-viewport",
    cols: process.stdout.columns ?? initialState.viewportCols,
    rows: process.stdout.rows ?? initialState.viewportRows,
  });
  void refreshRuntimeSummary();
  void refreshUsage();
}, TICK_MS);

try {
  await Promise.all([refreshRuntimeSummary(), refreshAccounts(), refreshUsage()]);
  await app.start();
} finally {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
