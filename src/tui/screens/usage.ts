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

function formatRequests(day: Pick<UsageDay, "requests" | "requestsKnown" | "requestFloor">): string {
  if (day.requestsKnown) {
    return String(day.requests);
  }

  return day.requestFloor > 0 ? `${day.requestFloor}+` : "--";
}

type UsageBodyDeps = Readonly<{
  state: TuiState;
  onSelectDate: (date: string | null) => void;
  onFilterChange: (value: string) => void;
}>;

function buildSummaryBar(days: readonly UsageDay[]): VNode {
  const todayDate = new Date().toISOString().split("T")[0] as string;
  const today = days.find((day) => day.date === todayDate);
  const summaryDay = today ?? {
    date: todayDate,
    requests: 0,
    requestsKnown: true,
    requestFloor: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cacheTypeLabel: "--",
    cacheHitRate: 0,
  };

  return ui.column({ gap: 1 }, [
    ui.row({ gap: 2, items: "center", wrap: true }, [
      ui.text("Today:", { variant: "heading" }),
      ui.text(`req ${formatRequests(summaryDay)}`, { variant: "code" }),
      ui.text(`in ${formatTokens(summaryDay.inputTokens)}`, { variant: "code" }),
      ui.text(`out ${formatTokens(summaryDay.outputTokens)}`, { variant: "code" }),
      ui.text(`cache read ${formatTokens(summaryDay.cacheReadTokens)}`, { variant: "code" }),
      ui.text(`cache write ${formatTokens(summaryDay.cacheWriteTokens)}`, { variant: "code" }),
    ]),
    ui.row({ gap: 2, items: "center" }, [
      ui.text(`cache hit ${formatPercent(summaryDay.cacheHitRate)}`, { variant: "code" }),
      ui.text(`cache type ${summaryDay.cacheTypeLabel}`, { variant: "code" }),
    ]),
  ]);
}

function filterDays(days: readonly UsageDay[], filterQuery: string): readonly UsageDay[] {
  const query = filterQuery.trim().toLowerCase();
  if (query.length === 0) {
    return days;
  }

  return days.filter((day) => {
    const searchable = [
      day.date,
      day.cacheTypeLabel,
      String(day.requests),
      String(day.inputTokens),
      String(day.outputTokens),
      String(day.cacheReadTokens),
      String(day.cacheWriteTokens),
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(query);
  });
}

function buildFilterRow(state: TuiState, onFilterChange: (value: string) => void): VNode {
  return ui.row({ gap: 1, items: "center", wrap: true }, [
    ui.field({
      label: "Search / filter",
      children: ui.input({
        id: "usage-filter",
        value: state.usage.filterQuery,
        placeholder: "date or cache type",
        onInput: (value) => onFilterChange(value),
      }),
    }),
    state.usage.filterQuery.length > 0
      ? ui.button({
          id: "usage-filter-clear",
          label: "Clear",
          intent: "secondary",
          onPress: () => onFilterChange(""),
        })
      : null,
  ].filter(Boolean) as VNode[]);
}

function buildUsageTable(deps: UsageBodyDeps): VNode {
  const { state, onSelectDate } = deps;
  const days = filterDays(state.usage.days, state.usage.filterQuery);

  const tableData = days.map((day) => ({
    date: day.date,
    requests: formatRequests(day),
    inputTok: formatTokens(day.inputTokens),
    outputTok: formatTokens(day.outputTokens),
    cacheRead: formatTokens(day.cacheReadTokens),
    cacheWrite: `${formatTokens(day.cacheWriteTokens)} `,
    cacheType: ` ${day.cacheTypeLabel}`,
    hitRate: formatPercent(day.cacheHitRate),
  }));

  return ui.column({ gap: 1 }, [
    ui.table({
      id: "usage-table",
      border: "single",
      columns: [
        { key: "date", header: "Date", width: 12 },
        { key: "requests", header: "Req", width: 6, align: "right" },
        { key: "inputTok", header: "In Tok", width: 8, align: "right" },
        { key: "outputTok", header: "Out Tok", width: 8, align: "right" },
        { key: "cacheRead", header: "Read", width: 8, align: "right" },
        { key: "cacheWrite", header: "Wr ", width: 5, align: "right" },
        { key: "cacheType", header: " Type", width: 9 },
        { key: "hitRate", header: "Hit %", width: 7, align: "right" },
      ],
      data: tableData,
      getRowKey: (row) => row.date,
      selection: state.usage.selectedDate ? [state.usage.selectedDate] : [],
      selectionMode: "single",
      onSelectionChange: (keys) => onSelectDate(keys[0] ?? null),
    }),
    tableData.length === 0
      ? ui.text(
          state.usage.filterQuery.trim().length > 0
            ? "No usage rows match this filter."
            : "Usage data will appear here after requests are processed.",
          { variant: "caption" },
        )
      : null,
  ]);
}

function buildUsageBody(deps: UsageBodyDeps): VNode {
  const { state } = deps;

  return ui.column({ gap: 1, flex: 1 }, [
    buildFilterRow(state, deps.onFilterChange),
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
    onFilterChange: (value: string) => void;
  },
): VNode {
  return renderShell({
    context,
    title: "Usage",
    body: buildUsageBody({
      state: context.state,
      onSelectDate: deps.onSelectDate,
      onFilterChange: deps.onFilterChange,
    }),
    onNavigate: deps.onNavigate,
    onToggleSidebar: deps.onToggleSidebar,
  });
}
