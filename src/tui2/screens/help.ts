import chalk from "chalk";
import { hRule, muted, padRight, sectionHeader, truncLine } from "../render.js";

function kb(key: string, desc: string, keyW: number, width: number): string {
  return truncLine(padRight(chalk.white(key), keyW) + muted(desc), width);
}

export function renderHelpScreen(width: number): string[] {
  const lines: string[] = [];
  const kw = 20;

  lines.push(sectionHeader("Help", width));
  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Global shortcuts"), width));
  lines.push(hRule(width));
  lines.push(kb("q / Ctrl+C", "quit", kw, width));
  lines.push(kb("Tab / Shift+Tab", "switch focus (sidebar ↔ main)", kw, width));
  lines.push(kb("[", "toggle sidebar collapse", kw, width));
  lines.push(kb("t", "cycle theme", kw, width));
  lines.push(kb("i", "toggle icon mode", kw, width));
  lines.push(kb("m", "toggle mouse support", kw, width));
  lines.push(kb("? / h", "this help screen", kw, width));
  lines.push(kb("mouse / wheel", "click buttons, rows, sidebar; wheel scrolls lists", kw, width));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Live screen"), width));
  lines.push(hRule(width));
  lines.push(kb("S", "start server", kw, width));
  lines.push(kb("X", "stop server", kw, width));
  lines.push(kb("R", "restart server", kw, width));
  lines.push(kb("1 2 3 4", "set log level (off/error/error-debug/debug)", kw, width));
  lines.push(kb("↑ / ↓", "scroll logs", kw, width));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Accounts screen"), width));
  lines.push(hRule(width));
  lines.push(kb("A", "add account (opens popup)", kw, width));
  lines.push(kb("↑ / ↓", "select account", kw, width));

   lines.push(hRule(width));
   lines.push(truncLine(chalk.bold("Artifacts screen"), width));
   lines.push(hRule(width));
   lines.push(kb("/", "filter request folders/files", kw, width));
   lines.push(kb("← / →", "switch tree and preview pane", kw, width));
   lines.push(kb("PgUp / PgDn", "scroll preview content", kw, width));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Authentication flow"), width));
  lines.push(hRule(width));
  lines.push(muted("  1. Go to Accounts → press A"));
  lines.push(muted("  2. Enter account ID → Start auth"));
  lines.push(muted("  3. Scan QR or press O to open the browser link"));
  lines.push(muted("  4. Approve in browser — done"));

  lines.push(hRule(width));
  lines.push(truncLine(chalk.bold("Important paths"), width));
  lines.push(hRule(width));
  lines.push(truncLine(muted("  Accounts: ") + "~/.qwen/oauth_creds_<id>.json", width));
  lines.push(truncLine(muted("  Logs:     ") + "./log/", width));
  lines.push(truncLine(muted("  Artifacts:") + " ./debug/", width));

  return lines;
}
