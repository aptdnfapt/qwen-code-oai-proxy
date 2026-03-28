import { exit } from "process";
import { createNodeApp } from "@rezi-ui/node";
import { createKeybindingMap } from "./helpers/keybindings.js";
import { createRuntimeMonitor } from "./helpers/runtime.js";
import { createInitialState, reduceTuiState } from "./helpers/state.js";
import { createTuiRoutes } from "./screens/index.js";
import { themeSpec } from "./theme.js";
import type { ScreenId, TuiAction, TuiState } from "./types.js";

const UI_FPS_CAP = 30;
const TICK_MS = 1000;
const initialState = createInitialState();
const runtimeMonitor = createRuntimeMonitor(initialState.bootMs);

let app!: ReturnType<typeof createNodeApp<TuiState>>;
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
    if (input === "q" || input === "Q") {
      dispatch({ type: "request-quit" });
      void stopApp();
      return;
    }

    if (input === "[") {
      dispatch({ type: "toggle-sidebar" });
      return;
    }

    if (input === "t" || input === "T") {
      dispatch({ type: "cycle-theme" });
      return;
    }

    if (input === "i" || input === "I") {
      dispatch({ type: "toggle-icon-mode" });
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
