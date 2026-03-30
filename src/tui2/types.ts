export type ScreenId = "live" | "artifacts" | "accounts" | "usage" | "settings" | "help";
export type FocusRegion = "sidebar" | "main";
export type SidebarMode = "expanded" | "collapsed";
export type ThemeName = "dark" | "light";
export type IconMode = "fallback" | "nerd";
export type RotationMode = "RR" | "single" | "none";
export type RuntimeStatus = "ready" | "unauthenticated";
export type LogLevel = "off" | "error" | "error-debug" | "debug";
export type ServerState = "running" | "stopped" | "starting" | "stopping";

export type RuntimeSummary = Readonly<{
  serverState: ServerState;
  status: RuntimeStatus;
  host: string;
  port: number;
  uptimeMs: number;
  rotationMode: RotationMode;
  accountCount: number;
  requestCount: number;
  streamCount: number;
}>;

export type LogEntry = Readonly<{
  id: string;
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  formattedMessage?: string;
  source?: string;
}>;

export type ArtifactNode = Readonly<{
  name: string;
  path: string;
  type: "file" | "directory";
  children?: readonly ArtifactNode[];
  size?: number;
}>;

export type AccountInfo = Readonly<{
  id: string;
  status: "valid" | "expired" | "unknown";
  expiresAt?: number;
  todayRequests: number;
}>;

export type AccountsAuthPhase = "idle" | "initiating" | "waiting" | "success" | "failure";

export type AccountsAuthFlow = Readonly<{
  verificationUri: string;
  verificationUriComplete: string;
  userCode: string;
  deviceCode: string;
  codeVerifier: string;
  qrText: string;
}>;

export type AccountsAuthModalState = Readonly<{
  isOpen: boolean;
  accountId: string;
  phase: AccountsAuthPhase;
  message: string | null;
  flow: AccountsAuthFlow | null;
}>;

export type UsageDay = Readonly<{
  date: string;
  requests: number;
  requestsKnown: boolean;
  requestFloor: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheTypeLabel: string;
  cacheHitRate: number;
}>;

export type NavItem = Readonly<{
  id: ScreenId;
  title: string;
  fallbackIcon: string;
  nerdIcon: string;
  blurb: string;
}>;

export const NAV_ITEMS: readonly NavItem[] = Object.freeze([
  Object.freeze({
    id: "live",
    title: "Live",
    fallbackIcon: "LV",
    nerdIcon: "󰍹",
    blurb: "Live operator stream and runtime controls land here.",
  }),
  Object.freeze({
    id: "artifacts",
    title: "Artifacts",
    fallbackIcon: "AR",
    nerdIcon: "󰉋",
    blurb: "Request and debug artifact browsing lands here.",
  }),
  Object.freeze({
    id: "accounts",
    title: "Accounts",
    fallbackIcon: "AC",
    nerdIcon: "󰀉",
    blurb: "Account health, add/remove flows, and detail views land here.",
  }),
  Object.freeze({
    id: "usage",
    title: "Usage",
    fallbackIcon: "US",
    nerdIcon: "󰕾",
    blurb: "Request, token, and cache metrics land here.",
  }),
  Object.freeze({
    id: "settings",
    title: "Settings",
    fallbackIcon: "ST",
    nerdIcon: "󰒓",
    blurb: "Theme, sidebar, and runtime preferences land here.",
  }),
  Object.freeze({
    id: "help",
    title: "Help",
    fallbackIcon: "HP",
    nerdIcon: "󰞋",
    blurb: "Shortcuts, auth guidance, and path references land here.",
  }),
]);

export type LiveScreenState = Readonly<{
  logLevel: LogLevel;
  logs: readonly LogEntry[];
  logsScrollTop: number;
}>;

export type ArtifactsScreenState = Readonly<{
  tree: readonly ArtifactNode[];
  expanded: readonly string[];
  selected: string | null;
  previewContent: string | null;
  filterQuery: string;
  previewScrollTop: number;
  activePane: "tree" | "preview";
}>;

export type DeleteConfirmModalState = Readonly<{
  isOpen: boolean;
  accountId: string;
}>;

export type AccountsScreenState = Readonly<{
  accounts: readonly AccountInfo[];
  selectedId: string | null;
  authModal: AccountsAuthModalState;
  deleteModal: DeleteConfirmModalState;
}>;

export type UsageScreenState = Readonly<{
  days: readonly UsageDay[];
  selectedDate: string | null;
  filterQuery: string;
}>;

export type ServerConfig = Readonly<{
  port: number;
  host: string;
  autoStart: boolean;
}>;

export type TuiState = Readonly<{
  nowMs: number;
  bootMs: number;
  viewportCols: number;
  viewportRows: number;
  activeScreen: ScreenId;
  focusRegion: FocusRegion;
  sidebarIndex: number;
  sidebarMode: SidebarMode;
  themeName: ThemeName;
  iconMode: IconMode;
  runtime: RuntimeSummary;
  shouldQuit: boolean;
  live: LiveScreenState;
  artifacts: ArtifactsScreenState;
  accounts: AccountsScreenState;
  usage: UsageScreenState;
  serverConfig: ServerConfig;
}>;

export type TuiAction =
  | Readonly<{ type: "tick"; nowMs: number }>
  | Readonly<{ type: "set-viewport"; cols: number; rows: number }>
  | Readonly<{ type: "navigate"; screen: ScreenId }>
  | Readonly<{ type: "toggle-sidebar" }>
  | Readonly<{ type: "set-sidebar-mode"; mode: SidebarMode }>
  | Readonly<{ type: "toggle-icon-mode" }>
  | Readonly<{ type: "set-icon-mode"; mode: IconMode }>
  | Readonly<{ type: "cycle-theme" }>
  | Readonly<{ type: "set-theme"; theme: ThemeName }>
  | Readonly<{ type: "set-runtime"; runtime: RuntimeSummary }>
  | Readonly<{ type: "request-quit" }>
  | Readonly<{ type: "set-focus-region"; region: FocusRegion }>
  | Readonly<{ type: "focus-next-region" }>
  | Readonly<{ type: "focus-prev-region" }>
  | Readonly<{ type: "sidebar-move"; direction: "up" | "down" }>
  | Readonly<{ type: "sidebar-activate" }>
  | Readonly<{ type: "set-log-level"; level: LogLevel }>
  | Readonly<{ type: "append-log"; entry: LogEntry }>
  | Readonly<{ type: "set-logs-scroll"; scrollTop: number }>
  | Readonly<{ type: "set-artifacts-tree"; tree: readonly ArtifactNode[] }>
  | Readonly<{ type: "toggle-artifact-expand"; path: string }>
  | Readonly<{ type: "select-artifact"; path: string | null }>
  | Readonly<{ type: "set-artifact-preview"; content: string | null }>
  | Readonly<{ type: "set-artifact-filter"; value: string }>
  | Readonly<{ type: "set-artifact-preview-scroll"; scrollTop: number }>
  | Readonly<{ type: "set-artifact-pane"; pane: "tree" | "preview" }>
  | Readonly<{ type: "set-accounts"; accounts: readonly AccountInfo[] }>
  | Readonly<{ type: "select-account"; id: string | null }>
  | Readonly<{ type: "open-auth-modal" }>
  | Readonly<{ type: "close-auth-modal" }>
  | Readonly<{ type: "open-delete-modal"; accountId: string }>
  | Readonly<{ type: "close-delete-modal" }>
  | Readonly<{ type: "set-auth-account-id"; accountId: string }>
  | Readonly<{ type: "auth-start"; message: string }>
  | Readonly<{ type: "auth-device-flow-ready"; flow: AccountsAuthFlow; message: string }>
  | Readonly<{ type: "auth-success"; message: string }>
  | Readonly<{ type: "auth-failure"; message: string }>
  | Readonly<{ type: "set-usage-days"; days: readonly UsageDay[] }>
  | Readonly<{ type: "select-usage-date"; date: string | null }>
  | Readonly<{ type: "set-usage-filter"; value: string }>
  | Readonly<{ type: "set-server-config"; port: number; host: string; autoStart: boolean }>;

export type ScreenRouteDeps = Readonly<{
  onNavigate: (screen: ScreenId) => void;
  onToggleSidebar: () => void;
}>;
