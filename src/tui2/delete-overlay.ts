import chalk from "chalk";
import { type Component, type Focusable, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { parseMouse } from "./mouse.js";
import { buttonHitAt, danger, hRule, layoutLabeledButtonGrid, muted, padRight, type ButtonHit, truncLine } from "./render.js";

export class DeleteConfirmOverlay implements Component, Focusable {
  focused = false;

  invalidate(): void {}

  private accountId: string;
  private lastRenderWidth = 0;
  private lastRenderHeight = 0;
  private lastButtonRow = -1;
  private lastButtonHits: readonly ButtonHit<string>[] = Object.freeze([]);

  public onConfirm?: () => void;
  public onCancel?: () => void;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  handleInput(data: string): void {
    const mouse = parseMouse(data);
    if (mouse && !mouse.release && !mouse.move && mouse.button === 0) {
      this.handleMouseClick(mouse.col, mouse.row);
      return;
    }

    if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
      this.onCancel?.();
      return;
    }

    if (data === "y" || data === "Y" || matchesKey(data, Key.enter)) {
      this.onConfirm?.();
      return;
    }
  }

  private handleMouseClick(col: number, row: number): void {
    if (this.lastButtonRow < 0) return;

    const cols = process.stdout.columns ?? 120;
    const rows = process.stdout.rows ?? 40;
    const overlayCol = Math.max(0, Math.floor((cols - this.lastRenderWidth) / 2));
    const overlayRow = Math.max(0, Math.floor((rows - this.lastRenderHeight) / 2));
    const localCol = col - overlayCol;
    const localRow = row - overlayRow;

    if (localRow !== this.lastButtonRow) return;

    const hit = buttonHitAt(this.lastButtonHits, localCol - 2);
    if (hit === "yes") {
      this.onConfirm?.();
    } else if (hit === "no") {
      this.onCancel?.();
    }
  }

  render(width: number): string[] {
    const lines: string[] = [];
    const innerW = width - 4;

    const borderH = "─".repeat(innerW + 2);
    const top = chalk.dim("┌" + borderH + "┐");
    const bot = chalk.dim("└" + borderH + "┘");
    const side = chalk.dim("│");

    function row(content: string): string {
      return side + " " + truncateToWidth(padRight(content, innerW), innerW, "") + " " + side;
    }

    this.lastRenderWidth = width;
    this.lastButtonRow = -1;
    this.lastButtonHits = Object.freeze([]);

    lines.push(top);
    lines.push(row(chalk.bold.red("Delete Account")));
    lines.push(row(hRule(innerW)));
    lines.push(row(danger("This will permanently remove the account credentials.")));
    lines.push(row(""));
    lines.push(row(muted("Account: ") + chalk.white(this.accountId)));
    lines.push(row(""));
    lines.push(row(hRule(innerW)));

    const buttons = layoutLabeledButtonGrid([
      { label: "Confirm", items: [
        { id: "yes", label: "Yes, delete", tone: "danger" as const, selected: true },
        { id: "no", label: "Cancel", tone: "neutral" as const },
      ] },
    ], 10);

    this.lastButtonRow = lines.length + 1;
    this.lastButtonHits = buttons.hitRows[0]?.hits ?? Object.freeze([]);
    for (const buttonLine of buttons.lines) {
      lines.push(row(buttonLine));
    }

    lines.push(row(muted("Y/Enter confirm  N/Esc cancel")));
    lines.push(bot);

    this.lastRenderHeight = lines.length;
    return lines;
  }
}
