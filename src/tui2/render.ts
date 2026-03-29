import chalk from "chalk";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export const SIDEBAR_W = 20;
export const SIDEBAR_W_COLLAPSED = 6;

export function padRight(s: string, width: number): string {
  const vw = visibleWidth(s);
  if (vw >= width) return truncateToWidth(s, width, "");
  return s + " ".repeat(width - vw);
}

export function truncLine(s: string, width: number): string {
  return truncateToWidth(s, width);
}

export function hRule(width: number): string {
  return chalk.dim("─".repeat(Math.max(0, width)));
}

export function vDivider(): string {
  return chalk.dim("│");
}

export function sectionHeader(label: string, width: number): string {
  return truncLine(chalk.bold(label), width);
}

export function caption(s: string): string {
  return chalk.dim(s);
}

export function highlight(s: string): string {
  return chalk.cyan(s);
}

export function success(s: string): string {
  return chalk.green(s);
}

export function warning(s: string): string {
  return chalk.yellow(s);
}

export function danger(s: string): string {
  return chalk.red(s);
}

export function muted(s: string): string {
  return chalk.dim(s);
}

export function selected(s: string): string {
  return chalk.inverse(s);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}k`;
  return String(count);
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

export function formatExpiry(expiresAt: number | undefined): string {
  if (!expiresAt) return "--";
  const d = new Date(expiresAt);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = [d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
  return isToday ? `today ${time}` : d.toLocaleDateString();
}

export function zipColumns(left: string[], right: string[], leftW: number, divider: string, rightW: number, totalRows: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < totalRows; i++) {
    const l = padRight(left[i] ?? "", leftW);
    const r = padRight(right[i] ?? "", rightW);
    lines.push(l + divider + r);
  }
  return lines;
}
