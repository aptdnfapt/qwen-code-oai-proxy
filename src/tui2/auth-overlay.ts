import chalk from "chalk";
import { Input, type Component, type Focusable, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { AccountsAuthModalState } from "./types.js";
import { parseMouse } from "./mouse.js";
import { buttonHitAt, danger, hRule, layoutLabeledButtonGrid, muted, padRight, success, type ButtonHit, truncLine, warning } from "./render.js";
import { getViewportRows } from "./viewport.js";

function phaseColor(phase: AccountsAuthModalState["phase"]): (s: string) => string {
  if (phase === "success") return success;
  if (phase === "failure") return danger;
  if (phase === "waiting") return warning;
  return chalk.cyan;
}

function phaseLabel(phase: AccountsAuthModalState["phase"]): string {
  if (phase === "initiating") return "preparing...";
  if (phase === "waiting") return "waiting for browser approval...";
  if (phase === "success") return "authenticated!";
  if (phase === "failure") return "failed";
  return "ready";
}

export class AuthOverlay implements Component, Focusable {
  focused = false;

  invalidate(): void {}

  private input: Input;
  private modal: AccountsAuthModalState;
  private lastRenderWidth = 0;
  private lastRenderHeight = 0;
  private lastButtonRow = -1;
  private lastButtonHits: readonly ButtonHit<string>[] = Object.freeze([]);

  public onStartAuth?: () => void;
  public onClose?: () => void;
  public onAccountIdChange?: (id: string) => void;
  public onOpenBrowser?: () => void;

  constructor(modal: AccountsAuthModalState) {
    this.modal = modal;
    this.input = new Input();
    this.input.setValue(modal.accountId);
    this.input.onSubmit = () => { this.onStartAuth?.(); };
  }

  get focused2(): boolean { return this.focused; }
  set focused2(v: boolean) {
    this.focused = v;
    this.input.focused = v;
  }

  update(modal: AccountsAuthModalState): void {
    this.modal = modal;
    if (modal.phase === "idle" || modal.phase === "failure") {
      this.input.setValue(modal.accountId);
    }
  }

  handleInput(data: string): void {
    const modal = this.modal;
    const busy = modal.phase === "initiating" || modal.phase === "waiting";
    const mouse = parseMouse(data);

    if (mouse && !mouse.release && !mouse.move && mouse.button === 0) {
      this.handleMouseClick(mouse.col, mouse.row);
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.onClose?.();
      return;
    }

    if (matchesKey(data, Key.enter) && modal.phase === "success") {
      this.onClose?.();
      return;
    }

    if (matchesKey(data, Key.enter) && busy) {
      this.onClose?.();
      return;
    }

    if (matchesKey(data, Key.enter) && modal.phase !== "success") {
      this.onStartAuth?.();
      return;
    }

    if ((data === "o" || data === "O") && modal.flow) {
      this.onOpenBrowser?.();
      return;
    }

    if (!busy && modal.phase !== "success") {
      const prev = this.input.getValue();
      this.input.handleInput?.(data);
      const next = this.input.getValue();
      if (prev !== next) {
        this.onAccountIdChange?.(next);
      }
    }
  }

  private handleMouseClick(col: number, row: number): void {
    if (this.lastButtonRow < 0) {
      return;
    }

    const cols = process.stdout.columns ?? 120;
    const rows = getViewportRows(process.stdout.rows);
    const overlayCol = Math.max(0, Math.floor((cols - this.lastRenderWidth) / 2));
    const overlayRow = Math.max(0, Math.floor((rows - this.lastRenderHeight) / 2));
    const localCol = col - overlayCol;
    const localRow = row - overlayRow;
    if (localRow !== this.lastButtonRow) {
      return;
    }

    const hit = buttonHitAt(this.lastButtonHits, localCol - 2);
    if (hit === "close") {
      this.onClose?.();
    } else if (hit === "start") {
      this.onStartAuth?.();
    } else if (hit === "open") {
      this.onOpenBrowser?.();
    }
  }

  render(width: number): string[] {
    const modal = this.modal;
    const busy = modal.phase === "initiating" || modal.phase === "waiting";
    const col = phaseColor(modal.phase);
    const lines: string[] = [];
    const innerW = width - 4;

    const borderH = "─".repeat(innerW + 2);
    const top = chalk.dim("┌" + borderH + "┐");
    const bot = chalk.dim("└" + borderH + "┘");
    const side = chalk.dim("│");
    const pad = " ".repeat(innerW);

    function row(content: string): string {
      return side + " " + truncateToWidth(padRight(content, innerW), innerW, "") + " " + side;
    }

    this.lastRenderWidth = width;
    this.lastButtonRow = -1;
    this.lastButtonHits = Object.freeze([]);

    lines.push(top);
    lines.push(row(chalk.bold("Add account")));
    lines.push(row(hRule(innerW)));
    lines.push(row(col(phaseLabel(modal.phase)) + (modal.message && modal.phase !== "idle" ? muted(" — " + modal.message) : "")));
    lines.push(row(pad));

    if (busy || modal.phase === "success") {
      lines.push(row(muted("account: ") + chalk.white(modal.accountId)));
    } else {
      lines.push(row(muted("account ID: ")));
      const inputLines = this.input.render(innerW);
      for (const l of inputLines) {
        lines.push(row(l));
      }
    }

    lines.push(row(muted("saved to ~/.qwen/oauth_creds_<id>.json")));

    if (modal.flow) {
      lines.push(row(pad));
      lines.push(row(hRule(innerW)));
      lines.push(row(muted("URL: ") + truncateToWidth(modal.flow.verificationUriComplete, innerW - 5)));
      lines.push(row(muted("code: ") + chalk.white(modal.flow.userCode)));
      lines.push(row(pad));
      lines.push(row(muted("QR code:")));
      const qrLines = modal.flow.qrText.split("\n").filter((l) => l.length > 0);
      for (const qrl of qrLines) {
        lines.push(row(qrl));
      }
    } else if (!busy) {
      lines.push(row(pad));
      lines.push(row(muted("steps: enter ID → Enter to start → scan QR → approve browser")));
    }

    lines.push(row(pad));
    lines.push(row(hRule(innerW)));

    if (modal.phase === "success") {
      const buttons = layoutLabeledButtonGrid([
        { label: "Actions", items: [{ id: "close", label: "Close", tone: "success", selected: true }] },
      ], 10);
      this.lastButtonRow = lines.length + 1;
      this.lastButtonHits = buttons.hitRows[0]?.hits ?? Object.freeze([]);
      for (const buttonLine of buttons.lines) {
        lines.push(row(buttonLine));
      }
      lines.push(row(muted("Enter close")));
    } else if (!busy) {
      const buttons = layoutLabeledButtonGrid([
        { label: "Actions", items: [
          { id: "start", label: "Start auth", tone: "accent", selected: true },
          { id: "close", label: "Close", tone: "neutral" },
        ] },
      ], 10);
      this.lastButtonRow = lines.length + 1;
      this.lastButtonHits = buttons.hitRows[0]?.hits ?? Object.freeze([]);
      for (const buttonLine of buttons.lines) {
        lines.push(row(buttonLine));
      }
      lines.push(row(muted("Enter start  Esc close")));
    } else {
      const buttons = modal.flow
        ? layoutLabeledButtonGrid([
            { label: "Actions", items: [
              { id: "open", label: "Open browser", tone: "accent", selected: true },
              { id: "close", label: "Close", tone: "neutral" },
            ] },
          ], 10)
        : null;
      if (buttons) {
        this.lastButtonRow = lines.length + 1;
        this.lastButtonHits = buttons.hitRows[0]?.hits ?? Object.freeze([]);
        for (const buttonLine of buttons.lines) {
          lines.push(row(buttonLine));
        }
        lines.push(row(muted("O open browser  Enter/Esc close")));
      } else {
        lines.push(row(muted("waiting...")));
      }
    }

    lines.push(bot);
    this.lastRenderHeight = lines.length;

    return lines;
  }
}
