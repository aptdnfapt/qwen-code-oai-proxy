import type { RouteRenderContext, VNode } from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import type { ScreenRouteDeps, TuiState, UsageDay } from "../types.js";
import { renderShell } from "./shell.js";

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}k`;
  return String(count);
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function computeTotals(days: readonly UsageDay[]): {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheHitRate: number;
} {
  const totals = days.reduce(
    (acc, day) => ({
      requests: acc.requests + day.requests,
      inputTokens: acc.inputTokens + day.inputTokens,
      outputTokens: acc.outputTokens + day.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + day.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + day.cacheWriteTokens,
    }),
    { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );

  const totalInput = totals.inputTokens + totals.cacheReadTokens;
  const cacheHitRate = totalInput > 0 ? totals.cacheReadTokens / totalInput : 0;

  return { ...totals, cacheHitRate };
}

type UsageBodyDeps = Readonly<{
  state: TuiState;
  onSelectDate: (date: string | null) => void;
}>;

function buildSummaryBar(days: readonly UsageDay[]): VNode {
  if (days.length === 0) {
    return ui.text("No usage data available", { variant: "caption" });
  }

  const totals = computeTotals(days);

  return ui.column({ gap: 1 }, [
    ui.row({ gap: 2, items: "center", wrap: true }, [
      ui.text("Total:", { variant: "heading" }),
      ui.text(`req ${totals.requests}`, { variant: "code" }),
      ui.text(`in ${formatTokens(totals.inputTokens)}`, { variant: "code" }),
      ui.text(`out ${formatTokens(totals.outputTokens)}`, { variant: "code" }),
      ui.text(`cache read ${formatTokens(totals.cacheReadTokens)}`, { variant: "code" }),
      ui.text(`cache write ${formatTokens(totals.cacheWriteTokens)}`, { variant: "code" }),
    ]),
    ui.row({ gap: 2, items: "center" }, [
      ui.text(`cache hit ${formatPercent(totals.cacheHitRate)}`, { variant: "code" }),
      ui.badge("ephemeral", { variant: "info" }),
    ]),
  ]);
}

function buildUsageTable(deps: UsageBodyDeps): VNode {
  const { state, onSelectDate } = deps;
  const days = state.usage.days;

  if (days.length === 0) {
    return ui.column({ gap: 1 }, [
      ui.text("No usage data yet", { variant: "heading" }),
      ui.divider({ color: "muted" }),
      ui.text("Usage data will appear here after requests are processed.", { variant: "caption" }),
    ]);
  }

  const tableData = days.map((day) => ({
    date: day.date,
    requests: String(day.requests),
    inputTok: formatTokens(day.inputTokens),
    outputTok: formatTokens(day.outputTokens),
    cacheRead: formatTokens(day.cacheReadTokens),
    cacheWrite: formatTokens(day.cacheWriteTokens),
    hitRate: formatPercent(day.cacheHitRate),
  }));

  return ui.table({
    id: "usage-table",
    border: "none",
    columns: [
      { key: "date", header: "Date", width: 12 },
      { key: "requests", header: "Req", width: 6, align: "right" },
      { key: "inputTok", header: "In Tok", width: 8, align: "right" },
      { key: "outputTok", header: "Out Tok", width: 8, align: "right" },
      { key: "cacheRead", header: "Cache Read", width: 11, align: "right" },
      { key: "cacheWrite", header: "Cache Write", width: 12, align: "right" },
      { key: "hitRate", header: "Hit %", width: 7, align: "right" },
    ],
    data: tableData,
    getRowKey: (row) => row.date,
    selection: state.usage.selectedDate ? [state.usage.selectedDate] : [],
    selectionMode: "single",
    onSelectionChange: (keys) => onSelectDate(keys[0] ?? null),
  });
}

function buildUsageBody(deps: UsageBodyDeps): VNode {
  const { state } = deps;

  return ui.column({ gap: 1, flex: 1 }, [
    buildSummaryBar(state.usage.days),
    ui.divider({ color: "muted" }),
    buildUsageTable(deps),
    ui.divider({ color: "muted" }),
    ui.row({ gap: 2, items: "center" }, [
      ui.text("↑↓ move", { variant: "caption" }),
      ui.text("Enter inspect", { variant: "caption" }),
    ]),
  ]);
}

export function renderUsageScreen(
  context: RouteRenderContext<TuiState>,
  deps: ScreenRouteDeps & {
    onSelectDate: (date: string | null) => void;
  },
): VNode {
  return renderShell({
    context,
    title: "Usage",
    body: buildUsageBody({
      state: context.state,
      onSelectDate: deps.onSelectDate,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}
