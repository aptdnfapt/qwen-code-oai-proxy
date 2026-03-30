import chalk from "chalk";
import type { AccountInfo, TuiState } from "../types.js";
import {
  caption, danger, formatExpiry, hRule, layoutLabeledButtonGrid, muted, padRight,
  sectionHeader, success, truncLine, warning,
} from "../render.js";

export const ACCOUNTS_ADD_BUTTON_ROW = 2;
export const ACCOUNTS_TABLE_START_ROW = 6;

function statusColor(status: AccountInfo["status"]): (s: string) => string {
  if (status === "valid") return success;
  if (status === "expired") return danger;
  return warning;
}

export function renderAccountsScreen(state: TuiState, width: number): string[] {
  const lines: string[] = [];
  const { accounts, selectedId } = state.accounts;

  lines.push(sectionHeader("Accounts", width));
  lines.push(hRule(width));
  const addGrid = layoutLabeledButtonGrid([
    { label: "New account", items: [{ id: "add", label: "Add", tone: "accent" }] },
  ], 14);
  lines.push(...addGrid.lines.map((line) => truncLine(`  ${line}`, width)));
  lines.push(hRule(width));

  if (accounts.length === 0) {
    lines.push(muted("  no accounts — press [A] to add one"));
    return lines;
  }

  const colId = 16;
  const colStatus = 8;
  const colExpiry = 16;
  const colReqs = 8;

  const header =
    padRight(chalk.bold("ID"), colId) +
    padRight(chalk.bold("Status"), colStatus) +
    padRight(chalk.bold("Expires"), colExpiry) +
    chalk.bold("Reqs");
  lines.push(truncLine("  " + header, width));
  lines.push(hRule(width));

  for (const acc of accounts) {
    const isSelected = acc.id === selectedId;
    const col = statusColor(acc.status);

    const row =
      padRight(acc.id, colId) +
      padRight(col(acc.status), colStatus) +
      padRight(muted(formatExpiry(acc.expiresAt)), colExpiry) +
      muted(String(acc.todayRequests));

    const line = isSelected
      ? chalk.inverse(padRight("  " + row, width))
      : "  " + row;
    lines.push(truncLine(line, width));
  }

  const sel = accounts.find((a) => a.id === selectedId);
  if (sel) {
    lines.push(hRule(width));
    lines.push(truncLine(caption("  selected: ") + chalk.white(sel.id) + "  " + statusColor(sel.status)(sel.status) + "  expires " + muted(formatExpiry(sel.expiresAt)), width));
  }

  return lines;
}
