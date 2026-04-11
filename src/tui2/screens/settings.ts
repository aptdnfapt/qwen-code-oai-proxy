import type { ButtonGridRow, ButtonTone } from "../render.js";
import type { IconMode, LogLevel, SelectionStyle, SidebarMode, ThemeName, TuiState } from "../types.js";
import { caption, hRule, layoutLabeledButtonGrid, muted, sectionHeader, strong, truncLine, value, warning } from "../render.js";
import { SELECTION_STYLE_ORDER, THEME_ORDER } from "../theme.js";

export const SETTINGS_THEME_ROW = 4;
export const SETTINGS_SIDEBAR_ROW = 5;
export const SETTINGS_SELECTION_ROW = 6;
export const SETTINGS_ICONS_ROW = 7;
export const SETTINGS_LOG_LEVEL_ROW = 11;
export const SETTINGS_AUTOSTART_ROW = 15;
export const SETTINGS_PORT_ROW = 16;
export const SETTINGS_HOST_ROW = 17;

function appearanceRows(state: TuiState): readonly ButtonGridRow<string>[] {
  const themes: readonly ThemeName[] = THEME_ORDER;
  const selectionStyles: readonly SelectionStyle[] = SELECTION_STYLE_ORDER;
  const sidebarModes: SidebarMode[] = ["expanded", "collapsed"];
  const iconModes: IconMode[] = ["nerd", "fallback"];

  return Object.freeze([
    Object.freeze({
      label: "Theme",
      items: themes.map((option) => ({ id: option, label: option, selected: option === state.themeName, tone: (option === state.themeName ? "accent" : "neutral") as ButtonTone })),
    }),
    Object.freeze({
      label: "Sidebar",
      items: sidebarModes.map((option) => ({ id: option, label: option, selected: option === state.sidebarMode, tone: (option === state.sidebarMode ? "accent" : "neutral") as ButtonTone })),
    }),
    Object.freeze({
      label: "Selection",
      items: selectionStyles.map((option) => ({ id: option, label: option, selected: option === state.selectionStyle, tone: (option === state.selectionStyle ? "accent" : "neutral") as ButtonTone })),
    }),
    Object.freeze({
      label: "Sidebar icons",
      items: iconModes.map((option) => ({ id: option, label: option, selected: option === state.iconMode, tone: (option === state.iconMode ? "accent" : "neutral") as ButtonTone })),
    }),
  ]);
}

function runtimeRows(state: TuiState): readonly ButtonGridRow<string>[] {
  const logLevels: LogLevel[] = ["off", "error", "error-debug", "debug"];
  return Object.freeze([
    Object.freeze({
      label: "Default log level",
      items: logLevels.map((option) => ({ id: option, label: option, selected: option === state.live.logLevel, tone: (option === state.live.logLevel ? "accent" : "neutral") as ButtonTone })),
    }),
  ]);
}

export function renderSettingsScreen(state: TuiState, width: number, editingField: "port" | "host" | null = null, editBuffer = ""): string[] {
  const lines: string[] = [];
  const sc = state.serverConfig;

  lines.push(sectionHeader("Settings", width));
  lines.push(hRule(width));
  lines.push(truncLine(strong("Appearance"), width));
  lines.push(hRule(width));
  lines.push(...layoutLabeledButtonGrid(appearanceRows(state), 18).lines.map((line) => truncLine(`  ${line}`, width)));

  lines.push(hRule(width));
  lines.push(truncLine(strong("Runtime defaults"), width));
  lines.push(hRule(width));
  lines.push(...layoutLabeledButtonGrid(runtimeRows(state), 18).lines.map((line) => truncLine(`  ${line}`, width)));

  lines.push(hRule(width));
  lines.push(truncLine(strong("Server"), width));
  lines.push(hRule(width));

  const autoStartGrid = layoutLabeledButtonGrid([
    { label: "Auto-start", items: [
      { id: "on", label: "on", selected: sc.autoStart, tone: (sc.autoStart ? "success" : "neutral") as ButtonTone },
      { id: "off", label: "off", selected: !sc.autoStart, tone: (!sc.autoStart ? "danger" : "neutral") as ButtonTone },
    ] },
  ], 14);
  lines.push(...autoStartGrid.lines.map((line) => truncLine(`  ${line}`, width)));

  const portValue = editingField === "port" ? warning(editBuffer + "▌") : value(String(sc.port));
  const hostValue = editingField === "host" ? warning(editBuffer + "▌") : value(sc.host);
  const portHint = editingField === "port" ? warning(" (editing — Enter save, Esc cancel)") : muted("  [P] edit");
  const hostHint = editingField === "host" ? warning(" (editing — Enter save, Esc cancel)") : muted("  [H] edit");

  lines.push(truncLine(caption("  Port    ") + portValue + portHint, width));
  lines.push(truncLine(caption("  Host    ") + hostValue + hostHint, width));

  lines.push(hRule(width));
  lines.push(truncLine(strong("Storage paths"), width));
  lines.push(hRule(width));
  lines.push(truncLine(caption("  Config   ") + muted("~/.local/share/qwen-proxy/config.json"), width));
  lines.push(truncLine(caption("  Logs     ") + muted("~/.local/share/qwen-proxy/log/"), width));
  lines.push(truncLine(caption("  Usage DB ") + muted("~/.local/share/qwen-proxy/usage.db"), width));
  lines.push(truncLine(caption("  Accounts ") + muted("~/.qwen/oauth_creds_<id>.json"), width));
  lines.push(truncLine(caption("  Theme    ") + muted("saved here automatically"), width));
  lines.push(truncLine(caption("  Selection") + muted(" saved here automatically"), width));

  lines.push(hRule(width));
  lines.push(truncLine(caption("  click a row  t theme  i icons  1-4 log level  P port  H host"), width));

  return lines;
}
