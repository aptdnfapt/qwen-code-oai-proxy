import {
  NAV_ITEMS,
  type AccountsScreenState,
  type ArtifactsScreenState,
  type LiveScreenState,
  type RuntimeSummary,
  type TuiAction,
  type TuiState,
  type UsageScreenState,
} from "../types.js";

function initialViewport(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns ?? 120,
    rows: process.stdout.rows ?? 40,
  };
}

function createInitialRuntime(): RuntimeSummary {
  return Object.freeze({
    serverState: "stopped",
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

function createInitialLiveState(): LiveScreenState {
  return Object.freeze({
    logLevel: "error-debug",
    logs: Object.freeze([]),
    logsScrollTop: 0,
  });
}

function createInitialArtifactsState(): ArtifactsScreenState {
  return Object.freeze({
    tree: Object.freeze([]),
    expanded: Object.freeze([]),
    selected: null,
    previewContent: null,
  });
}

function createInitialAuthModalState() {
  return Object.freeze({
    isOpen: false,
    accountId: "",
    phase: "idle",
    message: null,
    flow: null,
  });
}

function createInitialAccountsState(): AccountsScreenState {
  return Object.freeze({
    accounts: Object.freeze([]),
    selectedId: null,
    authModal: createInitialAuthModalState(),
  });
}

function createInitialUsageState(): UsageScreenState {
  return Object.freeze({
    days: Object.freeze([]),
    selectedDate: null,
    filterQuery: "",
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
    runtime: createInitialRuntime(),
    shouldQuit: false,
    live: createInitialLiveState(),
    artifacts: createInitialArtifactsState(),
    accounts: createInitialAccountsState(),
    usage: createInitialUsageState(),
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
    case "set-log-level":
      return Object.freeze({
        ...state,
        live: Object.freeze({
          ...state.live,
          logLevel: action.level,
        }),
      });
    case "append-log":
      return Object.freeze({
        ...state,
        live: Object.freeze({
          ...state.live,
          logs: Object.freeze([...state.live.logs, action.entry]),
        }),
      });
    case "set-logs-scroll":
      return Object.freeze({
        ...state,
        live: Object.freeze({
          ...state.live,
          logsScrollTop: action.scrollTop,
        }),
      });
    case "set-artifacts-tree":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          tree: action.tree,
        }),
      });
    case "toggle-artifact-expand": {
      const expanded = state.artifacts.expanded;
      const isExpanded = expanded.includes(action.path);
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          expanded: Object.freeze(
            isExpanded ? expanded.filter((p) => p !== action.path) : [...expanded, action.path],
          ),
        }),
      });
    }
    case "select-artifact":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          selected: action.path,
        }),
      });
    case "set-artifact-preview":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          previewContent: action.content,
        }),
      });
    case "set-accounts":
      {
        const selectedId =
          state.accounts.selectedId && action.accounts.some((account) => account.id === state.accounts.selectedId)
            ? state.accounts.selectedId
            : action.accounts[0]?.id ?? null;
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          accounts: action.accounts,
          selectedId,
        }),
      });
      }
    case "select-account":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          selectedId: action.id,
        }),
      });
    case "open-auth-modal":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: Object.freeze({
            isOpen: true,
            accountId: "",
            phase: "idle",
            message: null,
            flow: null,
          }),
        }),
      });
    case "close-auth-modal":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: createInitialAuthModalState(),
        }),
      });
    case "set-auth-account-id":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: Object.freeze({
            ...state.accounts.authModal,
            accountId: action.accountId,
            message: null,
          }),
        }),
      });
    case "auth-start":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: Object.freeze({
            ...state.accounts.authModal,
            phase: "initiating",
            message: action.message,
            flow: null,
          }),
        }),
      });
    case "auth-device-flow-ready":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: Object.freeze({
            ...state.accounts.authModal,
            phase: "waiting",
            message: action.message,
            flow: action.flow,
          }),
        }),
      });
    case "auth-success":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: Object.freeze({
            ...state.accounts.authModal,
            phase: "success",
            message: action.message,
          }),
        }),
      });
    case "auth-failure":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          authModal: Object.freeze({
            ...state.accounts.authModal,
            phase: "failure",
            message: action.message,
          }),
        }),
      });
    case "set-usage-days":
      {
        const selectedDate =
          state.usage.selectedDate && action.days.some((day) => day.date === state.usage.selectedDate)
            ? state.usage.selectedDate
            : action.days[0]?.date ?? null;
      return Object.freeze({
        ...state,
        usage: Object.freeze({
          ...state.usage,
          days: action.days,
          selectedDate,
        }),
      });
      }
    case "select-usage-date":
      return Object.freeze({
        ...state,
        usage: Object.freeze({
          ...state.usage,
          selectedDate: action.date,
        }),
      });
    case "set-usage-filter":
      return Object.freeze({
        ...state,
        usage: Object.freeze({
          ...state.usage,
          filterQuery: action.value,
        }),
      });
    default:
      return state;
  }
}
