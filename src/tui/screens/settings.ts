import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { IconMode, LogLevel, ScreenRouteDeps, SidebarMode, ThemeName, TuiState } from "../types.js";
import { renderShell } from "./shell.js";

type SettingsBodyDeps = Readonly<{
  state: TuiState;
  onThemeChange: (theme: ThemeName) => void;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onIconModeChange: (mode: IconMode) => void;
  onDefaultLogLevelChange: (level: LogLevel) => void;
}>;

function buildSettingRow(label: string, content: VNode): VNode {
  return ui.row({ gap: 2, items: "center" }, [
    ui.box({ width: 18 }, [ui.text(label, { variant: "caption" })]),
    content,
  ]);
}

function buildThemePicker(current: ThemeName, onChange: (theme: ThemeName) => void): VNode {
  const themes: ThemeName[] = ["dark", "light"];
  return ui.row({ gap: 1 }, [
    ...themes.map((theme) =>
      ui.button({
        id: `theme-${theme}`,
        label: theme.charAt(0).toUpperCase() + theme.slice(1),
        intent: current === theme ? "primary" : "secondary",
        onPress: () => onChange(theme),
      }),
    ),
  ]);
}

function buildSidebarModePicker(current: SidebarMode, onChange: (mode: SidebarMode) => void): VNode {
  const modes: SidebarMode[] = ["expanded", "collapsed"];
  return ui.row({ gap: 1 }, [
    ...modes.map((mode) =>
      ui.button({
        id: `sidebar-mode-${mode}`,
        label: mode.charAt(0).toUpperCase() + mode.slice(1),
        intent: current === mode ? "primary" : "secondary",
        onPress: () => onChange(mode),
      }),
    ),
  ]);
}

function buildIconModePicker(current: IconMode, onChange: (mode: IconMode) => void): VNode {
  const modes: IconMode[] = ["nerd", "fallback"];
  const labels: Record<IconMode, string> = { nerd: "Nerd Font", fallback: "Fallback" };
  return ui.row({ gap: 1 }, [
    ...modes.map((mode) =>
      ui.button({
        id: `icon-mode-${mode}`,
        label: labels[mode],
        intent: current === mode ? "primary" : "secondary",
        onPress: () => onChange(mode),
      }),
    ),
  ]);
}

function buildLogLevelPicker(current: LogLevel, onChange: (level: LogLevel) => void): VNode {
  const levels: LogLevel[] = ["off", "error", "error-debug", "debug"];
  return ui.row({ gap: 1 }, [
    ...levels.map((level) =>
      ui.button({
        id: `default-log-${level}`,
        label: level,
        intent: current === level ? "primary" : "secondary",
        onPress: () => onChange(level),
      }),
    ),
  ]);
}

function buildSettingsBody(deps: SettingsBodyDeps): VNode {
  const { state, onThemeChange, onSidebarModeChange, onIconModeChange, onDefaultLogLevelChange } = deps;

  return ui.column({ gap: 1 }, [
    ui.text("Appearance", { variant: "heading" }),
    ui.divider({ color: "muted" }),
    buildSettingRow("Theme", buildThemePicker(state.themeName, onThemeChange)),
    buildSettingRow("Sidebar", buildSidebarModePicker(state.sidebarMode, onSidebarModeChange)),
    buildSettingRow("Sidebar icons", buildIconModePicker(state.iconMode, onIconModeChange)),
    ui.spacer({ size: 1 }),
    ui.text("Runtime defaults", { variant: "heading" }),
    ui.divider({ color: "muted" }),
    buildSettingRow("Default log level", buildLogLevelPicker(state.live.logLevel, onDefaultLogLevelChange)),
    ui.spacer({ size: 1 }),
    ui.text("Storage info", { variant: "heading" }),
    ui.divider({ color: "muted" }),
    ui.row({ gap: 1 }, [
      ui.text("Config dir:", { variant: "caption" }),
      ui.text("~/.config/qwen-proxy", { variant: "code" }),
    ]),
    ui.row({ gap: 1 }, [
      ui.text("Logs dir:", { variant: "caption" }),
      ui.text("~/.local/share/qwen-proxy/logs", { variant: "code" }),
    ]),
    ui.row({ gap: 1 }, [
      ui.text("Accounts dir:", { variant: "caption" }),
      ui.text("~/.local/share/qwen-proxy/accounts", { variant: "code" }),
    ]),
  ]);
}

export function renderSettingsScreen(
  context: RouteRenderContext<TuiState>,
  deps: ScreenRouteDeps & {
    onThemeChange: (theme: ThemeName) => void;
    onSidebarModeChange: (mode: SidebarMode) => void;
    onIconModeChange: (mode: IconMode) => void;
    onDefaultLogLevelChange: (level: LogLevel) => void;
  },
): VNode {
  return renderShell({
    context,
    title: "Settings",
    body: buildSettingsBody({
      state: context.state,
      onThemeChange: deps.onThemeChange,
      onSidebarModeChange: deps.onSidebarModeChange,
      onIconModeChange: deps.onIconModeChange,
      onDefaultLogLevelChange: deps.onDefaultLogLevelChange,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}
