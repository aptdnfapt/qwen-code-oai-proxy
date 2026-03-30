import chalk from "chalk";
import type { ButtonGridRow, ButtonTone } from "../render.js";
import type { IconMode, LogLevel, SidebarMode, ThemeName, TuiState } from "../types.js";
import { caption, hRule, layoutLabeledButtonGrid, muted, sectionHeader, truncLine } from "../render.js";

export const SETTINGS_THEME_ROW = 4;
export const SETTINGS_SIDEBAR_ROW = 5;
export const SETTINGS_ICONS_ROW = 6;
export const SETTINGS_LOG_LEVEL_ROW = 10;

function appearanceRows(state: TuiState): readonly ButtonGridRow<string>[] {
  const themes: ThemeName[] = ["dark", "light"];
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

export function renderSettingsScreen(state: TuiState, width: number): string[] {
  const lines: string[] = [];

  lines.push(sectionHeader("Settings", width));
  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Appearance"), width));
  lines.push(hRule(width));
  lines.push(...layoutLabeledButtonGrid(appearanceRows(state), 18).lines.map((line) => truncLine(`  ${line}`, width)));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Runtime defaults"), width));
  lines.push(hRule(width));
  lines.push(...layoutLabeledButtonGrid(runtimeRows(state), 18).lines.map((line) => truncLine(`  ${line}`, width)));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Storage paths"), width));
  lines.push(hRule(width));
  lines.push(truncLine(caption("  Config   ") + muted("~/.local/share/qwen-proxy/config.json"), width));
  lines.push(truncLine(caption("  Logs     ") + muted("~/.local/share/qwen-proxy/log/"), width));
  lines.push(truncLine(caption("  Usage DB ") + muted("~/.local/share/qwen-proxy/usage.db"), width));
  lines.push(truncLine(caption("  Accounts ") + muted("~/.qwen/oauth_creds_<id>.json"), width));

  lines.push(hRule(width));
  lines.push(truncLine(caption("  click a row  t cycle theme  i toggle icon mode  1-4 set log level"), width));

  return lines;
}
