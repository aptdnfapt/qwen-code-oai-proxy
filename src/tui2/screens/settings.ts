import chalk from "chalk";
import type { IconMode, LogLevel, SidebarMode, ThemeName, TuiState } from "../types.js";
import { caption, hRule, layoutButtonGroup, muted, sectionHeader, truncLine } from "../render.js";

export const SETTINGS_THEME_ROW = 6;
export const SETTINGS_SIDEBAR_ROW = 10;
export const SETTINGS_ICONS_ROW = 14;
export const SETTINGS_LOG_LEVEL_ROW = 21;

function optionBlock<T extends string>(
  label: string,
  options: readonly T[],
  current: T,
): string[] {
  const opts = layoutButtonGroup(options.map((option) => ({
    id: option,
    label: option,
    selected: option === current,
    tone: option === current ? "accent" : "neutral",
  })));

  return [
    caption(`  ${label}`),
    ...opts.lines.map((line) => `  ${line}`),
  ];
}

export function renderSettingsScreen(state: TuiState, width: number): string[] {
  const lines: string[] = [];

  lines.push(sectionHeader("Settings", width));
  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Appearance"), width));
  lines.push(hRule(width));

  const themes: ThemeName[] = ["dark", "light"];
  lines.push(...optionBlock("Theme", themes, state.themeName).map((line) => truncLine(line, width)));

  const sidebarModes: SidebarMode[] = ["expanded", "collapsed"];
  lines.push(...optionBlock("Sidebar", sidebarModes, state.sidebarMode).map((line) => truncLine(line, width)));

  const iconModes: IconMode[] = ["fallback", "nerd"];
  lines.push(...optionBlock("Icons", iconModes, state.iconMode).map((line) => truncLine(line, width)));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Runtime defaults"), width));
  lines.push(hRule(width));

  const logLevels: LogLevel[] = ["off", "error", "error-debug", "debug"];
  lines.push(...optionBlock("Default log level", logLevels, state.live.logLevel).map((line) => truncLine(line, width)));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Storage paths"), width));
  lines.push(hRule(width));
  lines.push(truncLine(caption("  Config:   ") + muted("~/.config/qwen-proxy/"), width));
  lines.push(truncLine(caption("  Logs:     ") + muted("~/.local/share/qwen-proxy/logs/"), width));
  lines.push(truncLine(caption("  Accounts: ") + muted("~/.local/share/qwen-proxy/accounts/"), width));

  lines.push(hRule(width));
  lines.push(truncLine(caption("  t theme  [ sidebar  i icons  1-4 log level"), width));

  return lines;
}
