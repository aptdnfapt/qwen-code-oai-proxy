import chalk from "chalk";
import { type Component, type Focusable, type TUI, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import type { LogLevel, ScreenId, TuiAction, TuiState } from "./types.js";
import { NAV_ITEMS } from "./types.js";
import {
  caption, formatDuration, hRule, muted, padRight,
  sectionHeader, success, truncLine, warning, SIDEBAR_W, SIDEBAR_W_COLLAPSED,
} from "./render.js";
import { parseMouse } from "./mouse.js";
import { AuthOverlay } from "./auth-overlay.js";
import { renderLiveScreen } from "./screens/live.js";
import { renderAccountsScreen } from "./screens/accounts.js";
import { renderUsageScreen } from "./screens/usage.js";
import { renderArtifactsScreen } from "./screens/artifacts.js";
import { renderSettingsScreen } from "./screens/settings.js";
import { renderHelpScreen } from "./screens/help.js";

export type AppCallbacks = {
  dispatch: (action: TuiAction) => void;
  onQuit: () => void;
  onStartServer: () => void;
  onStopServer: () => void;
  onRestartServer: () => void;
  onLogLevelChange: (level: LogLevel) => void;
  onAddAccount: () => void;
  onOpenAuthBrowser: () => void;
  onCloseAuthModal: () => void;
  onAuthAccountIdChange: (id: string) => void;
  onStartAccountAuth: () => void;
  onSelectAccount: (id: string | null) => void;
  onSelectUsageDate: (date: string | null) => void;
  onUsageFilterChange: (value: string) => void;
  onToggleArtifactExpand: (path: string) => void;
  onSelectArtifact: (path: string | null) => void;
  onThemeChange: (theme: TuiState["themeName"]) => void;
};

export class AppView implements Component, Focusable {
  focused = false;

  private state: TuiState;
  private tui: TUI;
  private cb: AppCallbacks;
  private mouseEnabled = true;
  private authOverlayHandle: ReturnType<TUI["showOverlay"]> | null = null;
  private authOverlay: AuthOverlay | null = null;
  private filterMode = false;
  private filterBuffer = "";

  constructor(tui: TUI, initialState: TuiState, cb: AppCallbacks) {
    this.tui = tui;
    this.state = initialState;
    this.cb = cb;
  }

  invalidate(): void {}

  setState(state: TuiState): void {
    const wasOpen = this.state.accounts.authModal.isOpen;
    const isOpen = state.accounts.authModal.isOpen;
    this.state = state;

    if (isOpen && !wasOpen) {
      this.openAuthOverlay();
    } else if (!isOpen && wasOpen) {
      this.closeAuthOverlay();
    } else if (isOpen && this.authOverlay) {
      this.authOverlay.update(state.accounts.authModal);
      this.tui.requestRender();
    }
  }

  private openAuthOverlay(): void {
    const overlay = new AuthOverlay(this.state.accounts.authModal);
    overlay.focused = true;

    overlay.onAccountIdChange = (id) => {
      this.cb.onAuthAccountIdChange(id);
    };

    overlay.onStartAuth = () => {
      this.cb.onStartAccountAuth();
    };

    overlay.onClose = () => {
      this.cb.onCloseAuthModal();
    };

    this.authOverlay = overlay;
    this.authOverlayHandle = this.tui.showOverlay(overlay, {
      width: "60%",
      anchor: "center",
      margin: 2,
    });
    overlay.focused = true;
    this.tui.setFocus(overlay);
  }

  private closeAuthOverlay(): void {
    if (this.authOverlayHandle) {
      this.authOverlayHandle.hide();
      this.authOverlayHandle = null;
    }
    this.authOverlay = null;
    this.tui.setFocus(this);
    this.tui.requestRender();
  }

  private navigate(screen: ScreenId): void {
    this.cb.dispatch({ type: "navigate", screen });
  }

  private sidebarWidth(): number {
    const cols = this.state.viewportCols;
    if (this.state.sidebarMode === "collapsed" || cols <= 100) return SIDEBAR_W_COLLAPSED;
    return SIDEBAR_W;
  }

  handleInput(data: string): void {
    if (this.filterMode) {
      if (matchesKey(data, Key.escape)) {
        this.filterMode = false;
        this.filterBuffer = "";
        this.cb.onUsageFilterChange("");
      } else if (matchesKey(data, Key.enter)) {
        this.filterMode = false;
      } else if (matchesKey(data, Key.backspace)) {
        this.filterBuffer = this.filterBuffer.slice(0, -1);
        this.cb.onUsageFilterChange(this.filterBuffer);
      } else if (data.length === 1 && data >= " ") {
        this.filterBuffer += data;
        this.cb.onUsageFilterChange(this.filterBuffer);
      }
      this.tui.requestRender();
      return;
    }

    const mouse = parseMouse(data);
    if (mouse) {
      if (!mouse.release && mouse.button === 0) {
        this.handleClick(mouse.col, mouse.row);
      }
      return;
    }

    const screen = this.state.activeScreen;
    const focusRegion = this.state.focusRegion;

    if (matchesKey(data, Key.ctrl("c")) || data === "q") {
      this.cb.onQuit();
      return;
    }

    if (data === "[") {
      this.cb.dispatch({ type: "toggle-sidebar" });
      return;
    }

    if (data === "t") {
      this.cb.dispatch({ type: "cycle-theme" });
      return;
    }

    if (data === "i") {
      this.cb.dispatch({ type: "toggle-icon-mode" });
      return;
    }

    if (data === "m") {
      this.mouseEnabled = !this.mouseEnabled;
      if (this.mouseEnabled) {
        this.tui["terminal"]?.write?.("\x1b[?1000h\x1b[?1006h");
      } else {
        this.tui["terminal"]?.write?.("\x1b[?1000l\x1b[?1006l");
      }
      return;
    }

    if (data === "?" || data === "h") {
      this.navigate("help");
      return;
    }

    if (matchesKey(data, Key.tab)) {
      this.cb.dispatch({ type: "focus-next-region" });
      return;
    }

    if (matchesKey(data, Key.shift("tab"))) {
      this.cb.dispatch({ type: "focus-prev-region" });
      return;
    }

    if (focusRegion === "sidebar") {
      if (matchesKey(data, Key.up)) {
        this.cb.dispatch({ type: "sidebar-move", direction: "up" });
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.cb.dispatch({ type: "sidebar-move", direction: "down" });
        return;
      }
      if (matchesKey(data, Key.enter)) {
        const targetScreen = NAV_ITEMS[this.state.sidebarIndex]?.id ?? "live";
        this.navigate(targetScreen);
        return;
      }
    }

    if (screen === "live") {
      if (data === "s" || data === "S") { this.cb.onStartServer(); return; }
      if (data === "x" || data === "X") { this.cb.onStopServer(); return; }
      if (data === "r" || data === "R") { this.cb.onRestartServer(); return; }
      if (data === "1") { this.cb.onLogLevelChange("off"); return; }
      if (data === "2") { this.cb.onLogLevelChange("error"); return; }
      if (data === "3") { this.cb.onLogLevelChange("error-debug"); return; }
      if (data === "4") { this.cb.onLogLevelChange("debug"); return; }
      if (matchesKey(data, Key.up)) {
        const next = Math.max(0, this.state.live.logsScrollTop - 1);
        this.cb.dispatch({ type: "set-logs-scroll", scrollTop: next });
        return;
      }
      if (matchesKey(data, Key.down)) {
        const next = this.state.live.logsScrollTop + 1;
        this.cb.dispatch({ type: "set-logs-scroll", scrollTop: next });
        return;
      }
    }

    if (screen === "accounts") {
      if (data === "a" || data === "A") { this.cb.onAddAccount(); return; }
      if (matchesKey(data, Key.up)) {
        const accounts = this.state.accounts.accounts;
        const idx = accounts.findIndex((a) => a.id === this.state.accounts.selectedId);
        const next = accounts[Math.max(0, idx - 1)];
        if (next) this.cb.onSelectAccount(next.id);
        return;
      }
      if (matchesKey(data, Key.down)) {
        const accounts = this.state.accounts.accounts;
        const idx = accounts.findIndex((a) => a.id === this.state.accounts.selectedId);
        const next = accounts[Math.min(accounts.length - 1, idx + 1)];
        if (next) this.cb.onSelectAccount(next.id);
        return;
      }
    }

    if (screen === "usage") {
      if (data === "/" ) {
        this.filterMode = true;
        this.filterBuffer = this.state.usage.filterQuery;
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.escape)) {
        this.filterBuffer = "";
        this.cb.onUsageFilterChange("");
        return;
      }
      if (matchesKey(data, Key.up)) {
        const days = this.state.usage.days;
        const idx = days.findIndex((d) => d.date === this.state.usage.selectedDate);
        const next = days[Math.max(0, idx - 1)];
        if (next) this.cb.onSelectUsageDate(next.date);
        return;
      }
      if (matchesKey(data, Key.down)) {
        const days = this.state.usage.days;
        const idx = days.findIndex((d) => d.date === this.state.usage.selectedDate);
        const next = days[Math.min(days.length - 1, idx + 1)];
        if (next) this.cb.onSelectUsageDate(next.date);
        return;
      }
    }

    if (screen === "artifacts") {
      if (matchesKey(data, Key.enter)) {
        const sel = this.state.artifacts.selected;
        if (sel) this.cb.onToggleArtifactExpand(sel);
        return;
      }
    }

    if (screen === "settings") {
      if (data === "t") { this.cb.dispatch({ type: "cycle-theme" }); return; }
      if (data === "1") { this.cb.onLogLevelChange("off"); return; }
      if (data === "2") { this.cb.onLogLevelChange("error"); return; }
      if (data === "3") { this.cb.onLogLevelChange("error-debug"); return; }
      if (data === "4") { this.cb.onLogLevelChange("debug"); return; }
    }
  }

  private handleClick(col: number, row: number): void {
    const sbW = this.sidebarWidth();
    if (col < sbW) {
      const headerRows = 2;
      const itemRow = row - headerRows;
      if (itemRow >= 0 && itemRow < NAV_ITEMS.length) {
        const item = NAV_ITEMS[itemRow];
        if (item) {
          this.navigate(item.id);
          this.cb.dispatch({ type: "sidebar-activate" });
        }
      }
    }
  }

  private renderSidebar(sbW: number, rows: number): string[] {
    const state = this.state;
    const collapsed = sbW <= SIDEBAR_W_COLLAPSED;
    const lines: string[] = [];

    const title = collapsed ? "QP" : "qwen-proxy";
    lines.push(truncLine(chalk.bold(title), sbW));
    lines.push(truncLine(hRule(sbW), sbW));

    for (let i = 0; i < NAV_ITEMS.length; i++) {
      const item = NAV_ITEMS[i]!;
      const isActive = state.activeScreen === item.id;
      const isHighlighted = i === state.sidebarIndex && state.focusRegion === "sidebar";
      const icon = state.iconMode === "nerd" ? item.nerdIcon : item.fallbackIcon;

      let label: string;
      if (collapsed) {
        label = (isHighlighted ? ">" : isActive ? "*" : " ") + icon;
      } else {
        const prefix = isHighlighted ? ">" : isActive ? "*" : " ";
        label = `${prefix} ${icon} ${item.title}`;
      }

      const raw = padRight(label, sbW);
      const styled = isActive ? chalk.cyan(raw) : isHighlighted ? chalk.white(raw) : muted(raw);
      lines.push(truncLine(styled, sbW));
    }

    while (lines.length < rows - 2) lines.push(" ".repeat(sbW));

    lines.push(truncLine(hRule(sbW), sbW));
    const toggleLabel = collapsed ? "[>]" : "[<] collapse";
    lines.push(truncLine(muted(padRight(toggleLabel, sbW)), sbW));

    return lines;
  }

  private renderHeader(mainW: number): string {
    const runtime = this.state.runtime;
    const stateStr =
      runtime.serverState === "running" ? success("▶ " + runtime.serverState) :
      runtime.serverState === "stopped" ? warning("■ " + runtime.serverState) :
      chalk.cyan("⟳ " + runtime.serverState);
    const authStr = runtime.status === "ready" ? success("auth:ok") : warning("auth:none");
    const mouseStr = this.mouseEnabled ? chalk.cyan("mouse:on") : muted("mouse:off");
    const line = `${stateStr}  ${runtime.host}:${String(runtime.port)}  up ${formatDuration(runtime.uptimeMs)}  ${String(runtime.accountCount)} acc  ${runtime.rotationMode}  ${authStr}  ${mouseStr}`;
    return truncLine(line, mainW);
  }

  private renderFooter(mainW: number): string {
    const screen = this.state.activeScreen;
    const focusStr = this.state.focusRegion === "sidebar" ? chalk.cyan("sidebar") : chalk.cyan("main");
    const base = caption(`Tab focus(${focusStr})  [ sidebar  t theme  m mouse  q quit  ? help`);
    const filterHint = this.filterMode ? chalk.yellow("  [FILTER MODE] type to filter, Enter/Esc done") : "";
    return truncLine(base + filterHint, mainW);
  }

  render(width: number): string[] {
    const state = this.state;
    const terminal = this.tui["terminal"];
    const termRows: number = (terminal?.rows ?? process.stdout.rows ?? 40);

    const sbW = this.sidebarWidth();
    const mainW = Math.max(20, width - sbW - 1);

    const sidebarLines = this.renderSidebar(sbW, termRows);

    const header = this.renderHeader(mainW);
    const footer = this.renderFooter(mainW);
    const contentRows = Math.max(0, termRows - 2);

    let screenLines: string[];
    switch (state.activeScreen) {
      case "live":
        screenLines = renderLiveScreen(state, contentRows, mainW);
        break;
      case "accounts":
        screenLines = renderAccountsScreen(state, mainW);
        break;
      case "usage":
        screenLines = renderUsageScreen(state, mainW);
        break;
      case "artifacts":
        screenLines = renderArtifactsScreen(state, contentRows, mainW);
        break;
      case "settings":
        screenLines = renderSettingsScreen(state, mainW);
        break;
      case "help":
        screenLines = renderHelpScreen(mainW);
        break;
      default:
        screenLines = [muted("unknown screen")];
    }

    while (screenLines.length < contentRows) screenLines.push("");
    screenLines = screenLines.slice(0, contentRows);

    const allLines: string[] = [];
    allLines.push(padRight(sidebarLines[0] ?? "", sbW) + chalk.dim("│") + header);

    for (let i = 1; i < contentRows + 1; i++) {
      const sLine = padRight(sidebarLines[i] ?? "", sbW);
      const mLine = screenLines[i - 1] ?? "";
      allLines.push(sLine + chalk.dim("│") + mLine);
    }

    allLines.push(padRight(sidebarLines[contentRows + 1] ?? "", sbW) + chalk.dim("│") + footer);

    return allLines.map((l) => truncateToWidth(l, width));
  }
}
