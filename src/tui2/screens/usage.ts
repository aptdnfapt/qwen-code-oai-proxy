import chalk from "chalk";
import type { TuiState, UsageDay } from "../types.js";
import {
  caption, formatPercent, formatTokens, hRule, muted,
  padRight, sectionHeader, truncLine,
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
      `req ${chalk.white(formatRequests(today))}  ` +
      `in ${chalk.white(formatTokens(today.inputTokens))}  ` +
      `out ${chalk.white(formatTokens(today.outputTokens))}  ` +
      `cache-hit ${chalk.white(formatPercent(today.cacheHitRate))}`,
      width,
    ));
  } else {
    lines.push(muted("  no data for today yet"));
  }

  const totalWebSearchRequests = days.reduce((a, d) => a + d.webSearchRequests, 0);
  const totalWebSearchResults = days.reduce((a, d) => a + d.webSearchResults, 0);
  lines.push(truncLine(
    caption("  web-search  ") +
    `searches ${chalk.white(String(totalWebSearchRequests))}  ` +
    `results ${chalk.white(String(totalWebSearchResults))}`,
    width,
  ));
  lines.push(hRule(width));

  const filterLabel = filterQuery
    ? caption(`  filter: `) + chalk.white(filterQuery) + caption("  (Esc clear)")
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
    padRight(chalk.bold("Date"), cDate) +
    padRight(chalk.bold("Req"), cReq) +
    padRight(chalk.bold("In"), cIn) +
    padRight(chalk.bold("Out"), cOut) +
    padRight(chalk.bold("CacheRd"), cRead) +
    padRight(chalk.bold("CacheWr"), cWrite) +
    padRight(chalk.bold("Type"), cType) +
    chalk.bold("Hit%");
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

    lines.push(truncLine(isSelected ? chalk.inverse(padRight("  " + row, width)) : "  " + row, width));
  }

  lines.push(hRule(width));
  lines.push(truncLine(caption("  ↑↓ select  / filter  Esc clear filter"), width));

  return lines;
}
