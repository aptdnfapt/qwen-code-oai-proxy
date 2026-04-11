import chalk from "chalk";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { getThemePalette } from "./theme.js";

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

export type LabeledButtonGroupLayout<T extends string = string> = Readonly<{
  lines: readonly [string, string, string];
  hits: readonly ButtonHit<T>[];
}>;

export type ButtonGridRow<T extends string = string> = Readonly<{
  label: string;
  items: readonly ButtonRowItem<T>[];
}>;

export type LabeledButtonGridLayout<T extends string = string> = Readonly<{
  lines: readonly string[];
  hitRows: readonly Readonly<{
    lineIndex: number;
    hits: readonly ButtonHit<T>[];
  }>[];
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
  return getThemePalette().border("─".repeat(Math.max(0, width)));
}

export function vDivider(): string {
  return getThemePalette().border("│");
}

export function sectionHeader(label: string, width: number): string {
  return truncLine(strong(label), width);
}

export function caption(s: string): string {
  return muted(s);
}

export function highlight(s: string): string {
  return getThemePalette().accent(s);
}

export function success(s: string): string {
  return getThemePalette().success(s);
}

export function warning(s: string): string {
  return getThemePalette().warning(s);
}

export function danger(s: string): string {
  return getThemePalette().danger(s);
}

export function muted(s: string): string {
  return getThemePalette().muted(s);
}

export function value(s: string): string {
  return getThemePalette().text(s);
}

export function strong(s: string): string {
  return getThemePalette().heading(chalk.bold(s));
}

export function border(s: string): string {
  return getThemePalette().border(s);
}

export function selected(s: string): string {
  return getThemePalette().inverse(s);
}

function toneColor(tone: ButtonTone): (text: string) => string {
  const palette = getThemePalette();
  switch (tone) {
    case "danger":
      return palette.danger;
    case "success":
      return palette.success;
    case "neutral":
      return palette.neutral;
    default:
      return palette.accent;
  }
}

function toneFill(tone: ButtonTone): (text: string) => string {
  const palette = getThemePalette();
  switch (tone) {
    case "danger":
      return palette.dangerFill;
    case "success":
      return palette.successFill;
    case "neutral":
      return palette.neutralFill;
    default:
      return palette.accentFill;
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
    return border("│") + muted(content) + border("│");
  }

  if (item.selected) {
    return border("│") + fill(content) + border("│");
  }

  return border("│") + toneColor(tone)(content) + border("│");
}

function renderButtonCell<T extends string>(item: ButtonRowItem<T>, width: number): string {
  const tone = item.tone ?? "accent";
  const content = centerText(item.label, width);

  if (item.disabled) {
    return muted(content);
  }

  if (item.selected) {
    return toneFill(tone)(content);
  }

  return toneColor(tone)(content);
}

function renderButtonChip<T extends string>(item: ButtonRowItem<T>): string {
  const tone = item.tone ?? "accent";
  const content = ` ${item.label} `;

  if (item.disabled) {
    return muted(content);
  }

  if (item.selected) {
    return toneFill(tone)(content);
  }

  return toneColor(tone)(content);
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
  const top = border("┌") + widths.map((width) => "─".repeat(width)).join(border("┬")) + border("┐");
  const bottom = border("└") + widths.map((width) => "─".repeat(width)).join(border("┴")) + border("┘");

  const parts: string[] = [border("│")];
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
      cell = toneFill(tone)(content);
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
      parts.push(border("│"));
      offset += 1;
    }
  }

  parts.push(border("│"));

  return Object.freeze({
    lines: Object.freeze([top, parts.join(""), bottom]) as [string, string, string],
    hits: Object.freeze(hits),
  });
}

export function layoutLabeledButtonGroup<T extends string>(
  label: string,
  items: readonly ButtonRowItem<T>[],
  minLabelWidth = 12,
): LabeledButtonGroupLayout<T> {
  const labelWidth = Math.max(minLabelWidth, visibleWidth(label) + 2);
  const widths = items.map((item) => Math.max(visibleWidth(item.label) + 2, 6));
  const top =
    border("┌") +
    "─".repeat(labelWidth) +
    border("┬") +
    widths.map((width) => "─".repeat(width)).join(border("┬")) +
    border("┐");
  const bottom =
    border("└") +
    "─".repeat(labelWidth) +
    border("┴") +
    widths.map((width) => "─".repeat(width)).join(border("┴")) +
    border("┘");

  const parts: string[] = [border("│"), centerText(label, labelWidth), border("│")];
  const hits: ButtonHit<T>[] = [];
  let offset = labelWidth + 2;

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const tone = item.tone ?? "accent";
    const width = widths[index]!;
    const content = centerText(item.label, width);
    let cell = content;

    if (item.disabled) {
      cell = muted(content);
    } else if (item.selected) {
      cell = toneFill(tone)(content);
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
      parts.push(border("│"));
      offset += 1;
    }
  }

  parts.push(border("│"));

  return Object.freeze({
    lines: Object.freeze([top, parts.join(""), bottom]) as [string, string, string],
    hits: Object.freeze(hits),
  });
}

export function layoutLabeledButtonGrid<T extends string>(
  rows: readonly ButtonGridRow<T>[],
  minLabelWidth = 12,
): LabeledButtonGridLayout<T> {
  const labelWidth = Math.max(minLabelWidth, ...rows.map((row) => visibleWidth(row.label)));
  const lines: string[] = [];
  const hitRows: Array<{ lineIndex: number; hits: readonly ButtonHit<T>[] }> = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!;
    const parts: string[] = [];
    const hits: ButtonHit<T>[] = [];
    let offset = labelWidth + 2;

    for (let itemIndex = 0; itemIndex < row.items.length; itemIndex++) {
      const item = row.items[itemIndex]!;
      const chip = renderButtonChip(item);
      const width = visibleWidth(chip);
      parts.push(chip);
      hits.push(Object.freeze({
        id: item.id,
        start: offset,
        end: offset + width,
      }));
      offset += width;

      if (itemIndex < row.items.length - 1) {
        parts.push("  ");
        offset += 2;
      }
    }

    lines.push(`${caption(padRight(row.label, labelWidth))}  ${parts.join("")}`);
    hitRows.push(Object.freeze({ lineIndex: lines.length - 1, hits: Object.freeze(hits) }));
  }

  return Object.freeze({
    lines: Object.freeze(lines),
    hitRows: Object.freeze(hitRows),
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
