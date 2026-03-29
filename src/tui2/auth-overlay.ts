import chalk from "chalk";
import { Input, type Component, type Focusable, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { AccountsAuthModalState } from "./types.js";
import { danger, hRule, layoutButtonGroup, muted, padRight, success, truncLine, warning } from "./render.js";

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

    if (matchesKey(data, Key.escape)) {
      if (!busy) this.onClose?.();
      return;
    }

    if (matchesKey(data, Key.enter) && !busy && modal.phase !== "success") {
      this.onStartAuth?.();
      return;
    }

    if (matchesKey(data, Key.enter) && modal.phase === "success") {
      this.onClose?.();
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
      const buttons = layoutButtonGroup([
        { id: "close", label: "Close", tone: "success", selected: true },
      ]);
      for (const buttonLine of buttons.lines) {
        lines.push(row(buttonLine));
      }
      lines.push(row(muted("Enter close")));
    } else if (!busy) {
      const buttons = layoutButtonGroup([
        { id: "start", label: "Start auth", tone: "accent", selected: true },
        { id: "close", label: "Close", tone: "neutral" },
      ]);
      for (const buttonLine of buttons.lines) {
        lines.push(row(buttonLine));
      }
      lines.push(row(muted("Enter start  Esc close")));
    } else {
      const buttons = modal.flow
        ? layoutButtonGroup([
            { id: "open", label: "Open browser", tone: "accent", selected: true },
            { id: "close", label: "Close", tone: "neutral" },
          ]).lines
        : null;
      if (buttons) {
        for (const buttonLine of buttons) {
          lines.push(row(buttonLine));
        }
        lines.push(row(muted("O open browser")));
      } else {
        lines.push(row(muted("waiting...")));
      }
    }

    lines.push(bot);

    return lines;
  }
}
