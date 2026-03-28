import type { RouteDefinition } from "@rezi-ui/core";

export type ScreenId = "live" | "artifacts" | "accounts" | "usage" | "settings" | "help";
export type FocusRegion = "sidebar" | "main";
export type SidebarMode = "expanded" | "collapsed";
export type ThemeName = "dark" | "light";
export type IconMode = "fallback" | "nerd";
export type RotationMode = "RR" | "single" | "none";
export type RuntimeStatus = "ready" | "unauthenticated";

export type RuntimeSummary = Readonly<{
  status: RuntimeStatus;
  host: string;
  port: number;
  uptimeMs: number;
  rotationMode: RotationMode;
  accountCount: number;
  requestCount: number;
  streamCount: number;
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
}>;

export type TuiAction =
  | Readonly<{ type: "tick"; nowMs: number }>
  | Readonly<{ type: "set-viewport"; cols: number; rows: number }>
  | Readonly<{ type: "navigate"; screen: ScreenId }>
  | Readonly<{ type: "toggle-sidebar" }>
  | Readonly<{ type: "toggle-icon-mode" }>
  | Readonly<{ type: "cycle-theme" }>
  | Readonly<{ type: "set-runtime"; runtime: RuntimeSummary }>
  | Readonly<{ type: "request-quit" }>
  | Readonly<{ type: "focus-next-region" }>
  | Readonly<{ type: "focus-prev-region" }>
  | Readonly<{ type: "sidebar-move"; direction: "up" | "down" }>
  | Readonly<{ type: "sidebar-activate" }>;

export type ScreenRouteDeps = Readonly<{
  onNavigate: (screen: ScreenId) => void;
  onToggleSidebar: () => void;
}>;

export type TuiRouteDefinition = RouteDefinition<TuiState>;
