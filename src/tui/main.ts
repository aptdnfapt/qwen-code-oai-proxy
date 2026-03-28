import { exit } from "process";
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

let app!: ReturnType<typeof createNodeApp<TuiState>>;
let currentState: TuiState = initialState;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let stdinCleanup: (() => void) | null = null;
let resizeCleanup: (() => void) | null = null;

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

  if (stdinCleanup) {
    stdinCleanup();
    stdinCleanup = null;
  }

  if (resizeCleanup) {
    resizeCleanup();
    resizeCleanup = null;
  }

  try {
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

function installProcessHooks(): void {
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

  const onData = (chunk: Buffer | string): void => {
    const input = chunk.toString();

    // Quit
    if (input === "q" || input === "Q") {
      dispatch({ type: "request-quit" });
      void stopApp();
      return;
    }

    // Sidebar collapse/expand
    if (input === "[") {
      dispatch({ type: "toggle-sidebar" });
      return;
    }

    // Theme toggle
    if (input === "t" || input === "T") {
      dispatch({ type: "cycle-theme" });
      return;
    }

    // Icon mode toggle
    if (input === "i" || input === "I") {
      dispatch({ type: "toggle-icon-mode" });
      return;
    }

    // Tab - focus next region
    if (input === "\t") {
      dispatch({ type: "focus-next-region" });
      return;
    }

    // Shift+Tab - focus prev region
    if (input === "\x1b[Z") {
      dispatch({ type: "focus-prev-region" });
      return;
    }

    // Arrow up - sidebar move up (when sidebar focused)
    if (input === "\x1b[A") {
      if (currentState.focusRegion === "sidebar") {
        dispatch({ type: "sidebar-move", direction: "up" });
      }
      return;
    }

    // Arrow down - sidebar move down (when sidebar focused)
    if (input === "\x1b[B") {
      if (currentState.focusRegion === "sidebar") {
        dispatch({ type: "sidebar-move", direction: "down" });
      }
      return;
    }

    // Enter - activate sidebar selection (when sidebar focused)
    if (input === "\r" || input === "\n") {
      if (currentState.focusRegion === "sidebar") {
        const screen = NAV_ITEMS[currentState.sidebarIndex]?.id ?? "live";
        navigate(screen);
      }
      return;
    }

    // Help
    if (input === "?" || input === "h" || input === "H") {
      navigate("help");
      return;
    }
  };

  process.stdin.on("data", onData);
  stdinCleanup = () => {
    process.stdin.off("data", onData);
  };
}

app = createNodeApp({
  initialState,
  routes: createTuiRoutes({
    onNavigate: navigate,
    onToggleSidebar: () => dispatch({ type: "toggle-sidebar" }),
    // Live screen callbacks
    onLogLevelChange: (level: LogLevel) => dispatch({ type: "set-log-level", level }),
    onLogsScroll: (scrollTop: number) => dispatch({ type: "set-logs-scroll", scrollTop }),
    // Artifacts screen callbacks
    onToggleArtifactExpand: (path: string) => dispatch({ type: "toggle-artifact-expand", path }),
    onSelectArtifact: (path: string | null) => dispatch({ type: "select-artifact", path }),
    onActivateArtifact: (_path: string) => {
      // TODO: Load preview content for activated artifact
    },
    // Accounts screen callbacks
    onSelectAccount: (id: string | null) => dispatch({ type: "select-account", id }),
    onAddAccount: () => {
      // TODO: Open add account modal (5D)
    },
    onRefreshAccount: (_id: string) => {
      // TODO: Refresh account credentials
    },
    onRemoveAccount: (_id: string) => {
      // TODO: Remove account with confirmation
    },
    // Usage screen callbacks
    onSelectUsageDate: (date: string | null) => dispatch({ type: "select-usage-date", date }),
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
    onDefaultLogLevelChange: (level: LogLevel) => dispatch({ type: "set-log-level", level }),
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
    getFocusRegion: () => currentState.focusRegion,
  }),
);

installProcessHooks();

tickTimer = setInterval(() => {
  dispatch({ type: "tick", nowMs: Date.now() });
  dispatch({
    type: "set-viewport",
    cols: process.stdout.columns ?? initialState.viewportCols,
    rows: process.stdout.rows ?? initialState.viewportRows,
  });
  void refreshRuntimeSummary();
}, TICK_MS);

try {
  await refreshRuntimeSummary();
  await app.start();
} finally {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
