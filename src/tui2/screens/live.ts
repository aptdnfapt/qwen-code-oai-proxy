import chalk from "chalk";
import type { LogEntry, LogLevel, TuiState } from "../types.js";
import {
  type ButtonGridRow,
  type ButtonTone,
  caption, danger, formatDuration, formatTime, hRule,
  layoutLabeledButtonGrid,
  muted, sectionHeader, success, truncLine, warning,
} from "../render.js";

const LOG_LEVELS: readonly LogLevel[] = ["off", "error", "error-debug", "debug"];
export const LIVE_SERVER_ROW = 4;
export const LIVE_LOG_LEVEL_ROW = 5;

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

export function liveServerButtons(serverState: TuiState["runtime"]["serverState"]) {
  return [
    { id: "start", label: "Start", tone: "success", disabled: serverState === "running" },
    { id: "stop", label: "Stop", tone: "danger", disabled: serverState !== "running" },
    { id: "restart", label: "Restart", tone: "accent" },
  ] as const;
}

export function liveLogLevelButtons(current: LogLevel) {
  return LOG_LEVELS.map((level) => ({
    id: level,
    label: level,
    tone: (level === "off" ? "neutral" : level === "error" ? "danger" : level === "debug" ? "success" : "accent") as ButtonTone,
    selected: level === current,
  }));
}

function renderControlGrid(state: TuiState, width: number): string[] {
  const rows: readonly ButtonGridRow<string>[] = Object.freeze([
    Object.freeze({ label: "Server", items: liveServerButtons(state.runtime.serverState) }),
    Object.freeze({ label: "Log level", items: liveLogLevelButtons(state.live.logLevel) }),
  ]);
  return layoutLabeledButtonGrid(rows).lines.map((line) => truncLine(`  ${line}`, width));
}

function renderLogEntry(log: LogEntry, width: number): string {
  const time = muted(formatTime(log.timestamp));
  if (log.formattedMessage) {
    return truncLine(`${time}  ${log.formattedMessage}`, width);
  }
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
  lines.push(...renderControlGrid(state, width));
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
    ? caption(`  ↑↓ or wheel  ${String(scrollTop + 1)}-${String(Math.min(scrollTop + availRows, total))}/${String(total)}  Click buttons or use S/X/R + 1-4`)
    : caption("  Click buttons or use S/X/R + 1-4");
  lines.push(truncLine(hint, width));

  return lines;
}
