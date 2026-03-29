import chalk from "chalk";
import type { IconMode, LogLevel, SidebarMode, ThemeName, TuiState } from "../types.js";
import { caption, hRule, muted, padRight, sectionHeader, truncLine } from "../render.js";

function optionRow<T extends string>(
  label: string,
  options: readonly T[],
  current: T,
  labelW: number,
  width: number,
): string {
  const opts = options.map((o) =>
    o === current ? chalk.cyan(`[*] ${o}`) : muted(`[ ] ${o}`)
  ).join("  ");
  return truncLine(padRight(caption(label), labelW) + opts, width);
}

export function renderSettingsScreen(state: TuiState, width: number): string[] {
  const lines: string[] = [];
  const labelW = 20;

  lines.push(sectionHeader("Settings", width));
  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Appearance"), width));
  lines.push(hRule(width));

  const themes: ThemeName[] = ["dark", "light"];
  lines.push(optionRow("Theme", themes, state.themeName, labelW, width));

  const sidebarModes: SidebarMode[] = ["expanded", "collapsed"];
  lines.push(optionRow("Sidebar", sidebarModes, state.sidebarMode, labelW, width));

  const iconModes: IconMode[] = ["fallback", "nerd"];
  lines.push(optionRow("Icons", iconModes, state.iconMode, labelW, width));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Runtime defaults"), width));
  lines.push(hRule(width));

  const logLevels: LogLevel[] = ["off", "error", "error-debug", "debug"];
  lines.push(optionRow("Default log level", logLevels, state.live.logLevel, labelW, width));

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
