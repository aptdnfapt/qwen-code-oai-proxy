import type { TuiState, UsageDay } from "../types.js";
import {
  caption, formatPercent, formatTokens, hRule, muted,
  padRight, sectionHeader, selected, strong, truncLine, value,
} from "../render.js";

function formatRequests(day: Pick<UsageDay, "requests" | "requestsKnown" | "requestFloor">): string {
  if (day.requestsKnown) return String(day.requests);
  return day.requestFloor > 0 ? `${day.requestFloor}+` : "--";
}

function filterDays(days: readonly UsageDay[], query: string): readonly UsageDay[] {
  const q = query.trim().toLowerCase();
  if (!q) return days;
  return days.filter((d) =>
    [d.date, d.cacheTypeLabel, String(d.requests)].join(" ").toLowerCase().includes(q)
  );
}

export function renderUsageScreen(state: TuiState, width: number): string[] {
  const lines: string[] = [];
  const { days, selectedDate, filterQuery } = state.usage;

  lines.push(sectionHeader("Usage", width));
  lines.push(hRule(width));

  const todayDate = new Date().toISOString().split("T")[0] as string;
  const today = days.find((d) => d.date === todayDate);
  if (today) {
    lines.push(truncLine(
      caption("  today  ") +
      `req ${value(formatRequests(today))}  ` +
      `in ${value(formatTokens(today.inputTokens))}  ` +
      `out ${value(formatTokens(today.outputTokens))}  ` +
      `cache-hit ${value(formatPercent(today.cacheHitRate))}`,
      width,
    ));
  } else {
    lines.push(muted("  no data for today yet"));
  }

  const totalWebSearchRequests = days.reduce((a, d) => a + d.webSearchRequests, 0);
  const totalWebSearchResults = days.reduce((a, d) => a + d.webSearchResults, 0);
  lines.push(truncLine(
    caption("  web-search  ") +
    `searches ${value(String(totalWebSearchRequests))}  ` +
    `results ${value(String(totalWebSearchResults))}`,
    width,
  ));
  lines.push(hRule(width));

  const filterLabel = filterQuery
    ? caption(`  filter: `) + value(filterQuery) + caption("  (Esc clear)")
    : caption("  / to filter");
  lines.push(truncLine(filterLabel, width));
  lines.push(hRule(width));

  const filtered = filterDays(days, filterQuery);

  if (filtered.length === 0) {
    lines.push(muted(filterQuery ? "  no rows match filter" : "  no usage data yet"));
    return lines;
  }

  const cDate = 12, cReq = 6, cIn = 8, cOut = 8, cRead = 8, cWrite = 8, cType = 10, cHit = 7;
  const header =
    padRight(strong("Date"), cDate) +
    padRight(strong("Req"), cReq) +
    padRight(strong("In"), cIn) +
    padRight(strong("Out"), cOut) +
    padRight(strong("CacheRd"), cRead) +
    padRight(strong("CacheWr"), cWrite) +
    padRight(strong("Type"), cType) +
    strong("Hit%");
  lines.push(truncLine("  " + header, width));
  lines.push(hRule(width));

  for (const day of filtered) {
    const isSelected = day.date === selectedDate;
    const row =
      padRight(day.date, cDate) +
      padRight(muted(formatRequests(day)), cReq) +
      padRight(muted(formatTokens(day.inputTokens)), cIn) +
      padRight(muted(formatTokens(day.outputTokens)), cOut) +
      padRight(muted(formatTokens(day.cacheReadTokens)), cRead) +
      padRight(muted(formatTokens(day.cacheWriteTokens)), cWrite) +
      padRight(muted(day.cacheTypeLabel), cType) +
      muted(formatPercent(day.cacheHitRate));

    lines.push(truncLine(isSelected ? selected(padRight("  " + row, width)) : "  " + row, width));
  }

  lines.push(hRule(width));
  lines.push(truncLine(caption("  ↑↓ select  / filter  Esc clear filter"), width));

  return lines;
}
