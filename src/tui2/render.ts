import chalk from "chalk";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

export const SIDEBAR_W = 20;
export const SIDEBAR_W_COLLAPSED = 6;

export type ButtonTone = "accent" | "neutral" | "danger" | "success";

export type ButtonRowItem<T extends string = string> = Readonly<{
  id: T;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  tone?: ButtonTone;
}>;

export type ButtonHit<T extends string = string> = Readonly<{
  id: T;
  start: number;
  end: number;
}>;

export type ButtonGroupLayout<T extends string = string> = Readonly<{
  lines: readonly [string, string, string];
  hits: readonly ButtonHit<T>[];
}>;

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

function toneColor(tone: ButtonTone): typeof chalk.cyan {
  switch (tone) {
    case "danger":
      return chalk.red;
    case "success":
      return chalk.green;
    case "neutral":
      return chalk.white;
    default:
      return chalk.cyan;
  }
}

function toneFill(tone: ButtonTone): typeof chalk.bgCyan {
  switch (tone) {
    case "danger":
      return chalk.bgRed;
    case "success":
      return chalk.bgGreen;
    case "neutral":
      return chalk.bgWhite;
    default:
      return chalk.bgCyan;
  }
}

function centerText(text: string, width: number): string {
  const clean = truncateToWidth(text, width, "");
  const gap = Math.max(0, width - visibleWidth(clean));
  const left = Math.floor(gap / 2);
  const right = gap - left;
  return `${" ".repeat(left)}${clean}${" ".repeat(right)}`;
}

function renderButton<T extends string>(item: ButtonRowItem<T>): string {
  const tone = item.tone ?? "accent";
  const fill = toneFill(tone);
  const content = centerText(item.label, Math.max(visibleWidth(item.label) + 2, 6));

  if (item.disabled) {
    return chalk.dim("│") + muted(content) + chalk.dim("│");
  }

  if (item.selected) {
    return chalk.dim("│") + fill.black(content) + chalk.dim("│");
  }

  return chalk.dim("│") + toneColor(tone)(content) + chalk.dim("│");
}

export function layoutButtonRow<T extends string>(items: readonly ButtonRowItem<T>[], gap = 1): { line: string; hits: readonly ButtonHit<T>[] } {
  const parts: string[] = [];
  const hits: ButtonHit<T>[] = [];
  let offset = 0;

  for (let index = 0; index < items.length; index++) {
    const part = renderButton(items[index]!);
    const width = visibleWidth(part);
    hits.push(Object.freeze({
      id: items[index]!.id,
      start: offset,
      end: offset + width,
    }));
    parts.push(part);
    offset += width;
    if (index < items.length - 1) {
      parts.push(" ".repeat(gap));
      offset += gap;
    }
  }

  return {
    line: parts.join(""),
    hits: Object.freeze(hits),
  };
}

export function layoutButtonGroup<T extends string>(items: readonly ButtonRowItem<T>[]): ButtonGroupLayout<T> {
  const widths = items.map((item) => Math.max(visibleWidth(item.label) + 2, 6));
  const top = chalk.dim("┌") + widths.map((width) => "─".repeat(width)).join(chalk.dim("┬")) + chalk.dim("┐");
  const bottom = chalk.dim("└") + widths.map((width) => "─".repeat(width)).join(chalk.dim("┴")) + chalk.dim("┘");

  const parts: string[] = [chalk.dim("│")];
  const hits: ButtonHit<T>[] = [];
  let offset = 1;

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const tone = item.tone ?? "accent";
    const width = widths[index]!;
    const content = centerText(item.label, width);
    let cell = content;

    if (item.disabled) {
      cell = muted(content);
    } else if (item.selected) {
      cell = toneFill(tone).black(content);
    } else {
      cell = toneColor(tone)(content);
    }

    hits.push(Object.freeze({
      id: item.id,
      start: offset,
      end: offset + width,
    }));
    parts.push(cell);
    offset += width;

    if (index < items.length - 1) {
      parts.push(chalk.dim("│"));
      offset += 1;
    }
  }

  parts.push(chalk.dim("│"));

  return Object.freeze({
    lines: Object.freeze([top, parts.join(""), bottom]) as [string, string, string],
    hits: Object.freeze(hits),
  });
}

export function buttonHitAt<T extends string>(hits: readonly ButtonHit<T>[], col: number): T | null {
  for (const hit of hits) {
    if (col >= hit.start && col < hit.end) {
      return hit.id;
    }
  }

  return null;
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
