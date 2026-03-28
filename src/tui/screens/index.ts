import type {
  IconMode,
  LogLevel,
  ScreenRouteDeps,
  SidebarMode,
  ThemeName,
  TuiRouteDefinition,
} from "../types.js";
import { renderAccountsScreen } from "./accounts.js";
import { renderArtifactsScreen } from "./artifacts.js";
import { renderHelpScreen } from "./help.js";
import { renderLiveScreen } from "./live.js";
import { renderSettingsScreen } from "./settings.js";
import { renderUsageScreen } from "./usage.js";

export type ExtendedScreenRouteDeps = ScreenRouteDeps &
  Readonly<{
    // Live screen
    onStartServer: () => void;
    onStopServer: () => void;
    onRestartServer: () => void;
    onLogLevelChange: (level: LogLevel) => void;
    onLogsScroll: (scrollTop: number) => void;
    // Artifacts screen
    onToggleArtifactExpand: (path: string) => void;
    onSelectArtifact: (path: string | null) => void;
    onActivateArtifact: (path: string) => void;
    // Accounts screen
    onSelectAccount: (id: string | null) => void;
    onAddAccount: () => void;
    onRefreshAccount: (id: string) => void;
    onRemoveAccount: (id: string) => void;
    // Usage screen
    onSelectUsageDate: (date: string | null) => void;
    // Settings screen
    onThemeChange: (theme: ThemeName) => void;
    onSidebarModeChange: (mode: SidebarMode) => void;
    onIconModeChange: (mode: IconMode) => void;
    onDefaultLogLevelChange: (level: LogLevel) => void;
  }>;

export function createTuiRoutes(deps: ExtendedScreenRouteDeps): readonly TuiRouteDefinition[] {
  return Object.freeze([
    {
      id: "live",
      title: "Live",
      screen: (_params, context) =>
        renderLiveScreen(context, {
          onNavigate: deps.onNavigate,
          onToggleSidebar: deps.onToggleSidebar,
          onStartServer: deps.onStartServer,
          onStopServer: deps.onStopServer,
          onRestartServer: deps.onRestartServer,
          onLogLevelChange: deps.onLogLevelChange,
          onLogsScroll: deps.onLogsScroll,
        }),
    },
    {
      id: "artifacts",
      title: "Artifacts",
      screen: (_params, context) =>
        renderArtifactsScreen(context, {
          onNavigate: deps.onNavigate,
          onToggleSidebar: deps.onToggleSidebar,
          onToggleExpand: deps.onToggleArtifactExpand,
          onSelect: deps.onSelectArtifact,
          onActivate: deps.onActivateArtifact,
        }),
    },
    {
      id: "accounts",
      title: "Accounts",
      screen: (_params, context) =>
        renderAccountsScreen(context, {
          onNavigate: deps.onNavigate,
          onToggleSidebar: deps.onToggleSidebar,
          onSelect: deps.onSelectAccount,
          onAddAccount: deps.onAddAccount,
          onRefreshAccount: deps.onRefreshAccount,
          onRemoveAccount: deps.onRemoveAccount,
        }),
    },
    {
      id: "usage",
      title: "Usage",
      screen: (_params, context) =>
        renderUsageScreen(context, {
          onNavigate: deps.onNavigate,
          onToggleSidebar: deps.onToggleSidebar,
          onSelectDate: deps.onSelectUsageDate,
        }),
    },
    {
      id: "settings",
      title: "Settings",
      screen: (_params, context) =>
        renderSettingsScreen(context, {
          onNavigate: deps.onNavigate,
          onToggleSidebar: deps.onToggleSidebar,
          onThemeChange: deps.onThemeChange,
          onSidebarModeChange: deps.onSidebarModeChange,
          onIconModeChange: deps.onIconModeChange,
          onDefaultLogLevelChange: deps.onDefaultLogLevelChange,
        }),
    },
    {
      id: "help",
      title: "Help",
      screen: (_params, context) => renderHelpScreen(context, deps),
    },
  ]);
}
