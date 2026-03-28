import { NAV_ITEMS, type RuntimeSummary, type TuiAction, type TuiState } from "../types.js";

function initialViewport(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 40,
  };
}

function createInitialRuntime(nowMs: number): RuntimeSummary {
  return Object.freeze({
    status: "unauthenticated",
    host: "localhost",
    port: 8080,
    uptimeMs: 0,
      rotationMode: "none",
      accountCount: 0,
      requestCount: 0,
      streamCount: 0,
  });
}

export function createInitialState(nowMs = Date.now()): TuiState {
  const viewport = initialViewport();

  return Object.freeze({
    nowMs,
    bootMs: nowMs,
    viewportCols: viewport.cols,
    viewportRows: viewport.rows,
    activeScreen: "live",
    focusRegion: "sidebar",
    sidebarIndex: 0,
    sidebarMode: "expanded",
    themeName: "dark",
    iconMode: "fallback",
    runtime: createInitialRuntime(nowMs),
    shouldQuit: false,
  });
}

export function reduceTuiState(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "tick":
      return Object.freeze({
        ...state,
        nowMs: action.nowMs,
        runtime: Object.freeze({
          ...state.runtime,
          uptimeMs: Math.max(0, action.nowMs - state.bootMs),
        }),
      });
    case "set-viewport":
      return Object.freeze({
        ...state,
        viewportCols: action.cols,
        viewportRows: action.rows,
      });
    case "navigate":
      return Object.freeze({
        ...state,
        activeScreen: action.screen,
      });
    case "toggle-sidebar":
      return Object.freeze({
        ...state,
        sidebarMode: state.sidebarMode === "expanded" ? "collapsed" : "expanded",
      });
    case "toggle-icon-mode":
      return Object.freeze({
        ...state,
        iconMode: state.iconMode === "fallback" ? "nerd" : "fallback",
      });
    case "cycle-theme":
      return Object.freeze({
        ...state,
        themeName: state.themeName === "dark" ? "light" : "dark",
      });
    case "set-runtime":
      return Object.freeze({
        ...state,
        runtime: Object.freeze({
          ...action.runtime,
          uptimeMs: Math.max(0, state.nowMs - state.bootMs),
        }),
      });
    case "request-quit":
      return Object.freeze({
        ...state,
        shouldQuit: true,
      });
    case "focus-next-region":
      return Object.freeze({
        ...state,
        focusRegion: state.focusRegion === "sidebar" ? "main" : "sidebar",
      });
    case "focus-prev-region":
      return Object.freeze({
        ...state,
        focusRegion: state.focusRegion === "main" ? "sidebar" : "main",
      });
    case "sidebar-move": {
      const maxIndex = NAV_ITEMS.length - 1;
      const newIndex =
        action.direction === "up"
          ? Math.max(0, state.sidebarIndex - 1)
          : Math.min(maxIndex, state.sidebarIndex + 1);
      return Object.freeze({
        ...state,
        sidebarIndex: newIndex,
      });
    }
    case "sidebar-activate": {
      const targetScreen = NAV_ITEMS[state.sidebarIndex]?.id ?? "live";
      return Object.freeze({
        ...state,
        activeScreen: targetScreen,
      });
    }
    default:
      return state;
  }
}
