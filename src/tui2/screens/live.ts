import chalk from "chalk";
import { truncateToWidth } from "@mariozechner/pi-tui";
import type { LogEntry, LogLevel, TuiState } from "../types.js";
import {
  caption, danger, formatDuration, formatTime, hRule,
  muted, padRight, sectionHeader, success, truncLine, warning,
} from "../render.js";

const LOG_LEVELS: readonly LogLevel[] = ["off", "error", "error-debug", "debug"];

function levelColor(level: string): (s: string) => string {
  if (level === "error") return danger;
  if (level === "warn") return warning;
  if (level === "debug") return chalk.magenta;
  return (s) => s;
}

function renderServerStatus(runtime: TuiState["runtime"], width: number): string[] {
  const stateStr =
    runtime.serverState === "running" ? success("RUNNING") :
    runtime.serverState === "stopped" ? warning("STOPPED") :
    chalk.cyan(runtime.serverState.toUpperCase());

  const authStr = runtime.status === "ready" ? success("auth:ok") : warning("auth:none");
  const line = `${stateStr}  ${runtime.host}:${String(runtime.port)}  up ${formatDuration(runtime.uptimeMs)}  ${String(runtime.accountCount)} acc  ${runtime.rotationMode}  ${authStr}`;
  return [truncLine(line, width)];
}

function renderServerControls(serverState: TuiState["runtime"]["serverState"], focusMain: boolean, width: number): string[] {
  const actions = [
    { key: "S", label: "Start", active: serverState !== "running" },
    { key: "X", label: "Stop",  active: serverState === "running" },
    { key: "R", label: "Restart", active: true },
  ];
  const parts = actions.map(({ key, label, active }) => {
    const s = `[${key}] ${label}`;
    return active ? chalk.white(s) : muted(s);
  });
  return [truncLine(caption("  Server: ") + parts.join("  "), width)];
}

function renderLogLevelBar(current: LogLevel, width: number): string[] {
  const parts = LOG_LEVELS.map((level) => {
    const s = `[${level === current ? "*" : " "}] ${level}`;
    return level === current ? chalk.cyan(s) : muted(s);
  });
  return [truncLine(caption("  Log:    ") + parts.join("  "), width)];
}

function renderLogEntry(log: LogEntry, width: number): string {
  const time = muted(formatTime(log.timestamp));
  const col = levelColor(log.level);
  const level = col(log.level.padEnd(5));
  const msg = log.level === "error" ? danger(log.message) :
               log.level === "warn" ? warning(log.message) : log.message;
  return truncLine(`${time}  ${level}  ${msg}`, width);
}

export function renderLiveScreen(
  state: TuiState,
  termRows: number,
  width: number,
): string[] {
  const lines: string[] = [];

  lines.push(sectionHeader("Live", width));
  lines.push(hRule(width));
  lines.push(...renderServerStatus(state.runtime, width));
  lines.push(hRule(width));
  lines.push(...renderServerControls(state.runtime.serverState, state.focusRegion === "main", width));
  lines.push(...renderLogLevelBar(state.live.logLevel, width));
  lines.push(hRule(width));

  const headerLines = lines.length;
  const footerLines = 1;
  const availRows = Math.max(0, termRows - headerLines - footerLines);

  const logs = state.live.logs;
  const scrollTop = Math.max(0, Math.min(state.live.logsScrollTop, Math.max(0, logs.length - availRows)));

  if (logs.length === 0) {
    lines.push(muted("  no logs yet — start the server to see activity"));
  } else {
    const visible = logs.slice(scrollTop, scrollTop + availRows);
    for (const log of visible) {
      lines.push(renderLogEntry(log, width));
    }
    const remaining = availRows - visible.length;
    for (let i = 0; i < remaining; i++) lines.push("");
  }

  const total = logs.length;
  const hint = total > 0
    ? caption(`  ↑↓ scroll  ${String(scrollTop + 1)}-${String(Math.min(scrollTop + availRows, total))}/${String(total)}  S start  X stop  R restart  1-4 log level`)
    : caption("  S start  X stop  R restart  1-4 log level");
  lines.push(truncLine(hint, width));

  return lines;
}
