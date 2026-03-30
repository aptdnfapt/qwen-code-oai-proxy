import {
  NAV_ITEMS,
  type AccountsScreenState,
  type ArtifactNode,
  type ArtifactsScreenState,
  type LiveScreenState,
  type RuntimeSummary,
  type TuiAction,
  type TuiState,
  type UsageScreenState,
} from "./types.js";

function findNavIndex(screen: TuiState["activeScreen"]): number {
  const index = NAV_ITEMS.findIndex((item) => item.id === screen);
  return index >= 0 ? index : 0;
}

function findFirstArtifactPath(nodes: readonly ArtifactNode[]): string | null {
  for (const node of nodes) {
    if (node?.path) {
      return node.path;
    }
  }

  return null;
}

function artifactPathExists(nodes: readonly ArtifactNode[], target: string | null): boolean {
  if (!target) {
    return false;
  }

  for (const node of nodes) {
    if (node.path === target) {
      return true;
    }
    if (node.children && artifactPathExists(node.children, target)) {
      return true;
    }
  }

  return false;
}

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
    filterQuery: "",
    previewScrollTop: 0,
    activePane: "tree",
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

function createInitialDeleteModalState() {
  return Object.freeze({ isOpen: false, accountId: "" });
}

function createInitialAccountsState(): AccountsScreenState {
  return Object.freeze({
    accounts: Object.freeze([]),
    selectedId: null,
    authModal: createInitialAuthModalState(),
    deleteModal: createInitialDeleteModalState(),
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
    iconMode: "nerd",
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
    case "tick": {
      // Locally advance uptime every tick so the display doesn't wait for the
      // async refreshRuntimeSummary round-trip. set-runtime will correct it.
      const elapsedMs = action.nowMs - state.nowMs;
      const nextUptimeMs =
        state.runtime.serverState === "running"
          ? Math.max(0, state.runtime.uptimeMs + elapsedMs)
          : state.runtime.uptimeMs;
      return Object.freeze({
        ...state,
        nowMs: action.nowMs,
        runtime: Object.freeze({ ...state.runtime, uptimeMs: nextUptimeMs }),
      });
    }
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
        sidebarIndex: findNavIndex(action.screen),
      });
    case "toggle-sidebar":
      return Object.freeze({
        ...state,
        sidebarMode: state.sidebarMode === "expanded" ? "collapsed" : "expanded",
      });
    case "set-sidebar-mode":
      return Object.freeze({
        ...state,
        sidebarMode: action.mode,
      });
    case "toggle-icon-mode":
      return Object.freeze({
        ...state,
        iconMode: state.iconMode === "fallback" ? "nerd" : "fallback",
      });
    case "set-icon-mode":
      return Object.freeze({
        ...state,
        iconMode: action.mode,
      });
    case "cycle-theme":
      return Object.freeze({
        ...state,
        themeName: state.themeName === "dark" ? "light" : "dark",
      });
    case "set-theme":
      return Object.freeze({
        ...state,
        themeName: action.theme,
      });
    case "set-runtime":
      return Object.freeze({
        ...state,
        runtime: Object.freeze({ ...action.runtime }),
      });
    case "request-quit":
      return Object.freeze({
        ...state,
        shouldQuit: true,
      });
    case "set-focus-region":
      return Object.freeze({
        ...state,
        focusRegion: action.region,
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
      {
        const logs = [...state.live.logs, action.entry].slice(-400);
      return Object.freeze({
        ...state,
        live: Object.freeze({
          ...state.live,
          logs: Object.freeze(logs),
        }),
      });
      }
    case "set-logs-scroll":
      return Object.freeze({
        ...state,
        live: Object.freeze({
          ...state.live,
          logsScrollTop: action.scrollTop,
        }),
      });
    case "set-artifacts-tree":
      {
        const selected =
          artifactPathExists(action.tree, state.artifacts.selected)
            ? state.artifacts.selected
            : findFirstArtifactPath(action.tree);
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          tree: action.tree,
          selected,
          previewScrollTop: 0,
        }),
      });
      }
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
          previewScrollTop: 0,
        }),
      });
    case "set-artifact-preview":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          previewContent: action.content,
          previewScrollTop: 0,
        }),
      });
    case "set-artifact-filter":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          filterQuery: action.value,
        }),
      });
    case "set-artifact-preview-scroll":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          previewScrollTop: Math.max(0, action.scrollTop),
        }),
      });
    case "set-artifact-pane":
      return Object.freeze({
        ...state,
        artifacts: Object.freeze({
          ...state.artifacts,
          activePane: action.pane,
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
    case "open-delete-modal":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          deleteModal: Object.freeze({ isOpen: true, accountId: action.accountId }),
        }),
      });
    case "close-delete-modal":
      return Object.freeze({
        ...state,
        accounts: Object.freeze({
          ...state.accounts,
          deleteModal: createInitialDeleteModalState(),
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
