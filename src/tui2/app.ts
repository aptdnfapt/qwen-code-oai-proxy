import chalk from "chalk";
import { type Component, type Focusable, type TUI, Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { LogLevel, ScreenId, TuiAction, TuiState } from "./types.js";
import { NAV_ITEMS } from "./types.js";
import {
  buttonHitAt,
  caption, formatDuration, hRule, muted, padRight,
  layoutButtonGroup,
  success, truncLine, warning, SIDEBAR_W, SIDEBAR_W_COLLAPSED,
} from "./render.js";
import { disableMouse, enableMouse, parseMouse } from "./mouse.js";
import { AuthOverlay } from "./auth-overlay.js";
import { LIVE_LOG_LEVEL_ROW, LIVE_SERVER_ROW, liveLogLevelButtons, liveServerButtons, renderLiveScreen } from "./screens/live.js";
import { ACCOUNTS_ADD_BUTTON_ROW, ACCOUNTS_TABLE_START_ROW, renderAccountsScreen } from "./screens/accounts.js";
import { renderUsageScreen } from "./screens/usage.js";
import { ARTIFACT_TREE_START_ROW, artifactPaneWidths, flattenArtifactRows, renderArtifactsScreen } from "./screens/artifacts.js";
import {
  renderSettingsScreen,
  SETTINGS_ICONS_ROW,
  SETTINGS_LOG_LEVEL_ROW,
  SETTINGS_SIDEBAR_ROW,
  SETTINGS_THEME_ROW,
} from "./screens/settings.js";
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

    overlay.onOpenBrowser = () => {
      this.cb.onOpenAuthBrowser();
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

  private setFocusRegion(region: TuiState["focusRegion"]): void {
    this.cb.dispatch({ type: "set-focus-region", region });
  }

  private moveLiveLogs(delta: number): void {
    this.cb.dispatch({
      type: "set-logs-scroll",
      scrollTop: Math.max(0, this.state.live.logsScrollTop + delta),
    });
  }

  private stepAccounts(delta: number): void {
    const accounts = this.state.accounts.accounts;
    const idx = accounts.findIndex((account) => account.id === this.state.accounts.selectedId);
    const next = accounts[Math.max(0, Math.min(accounts.length - 1, idx + delta))];
    if (next) {
      this.cb.onSelectAccount(next.id);
    }
  }

  private stepUsage(delta: number): void {
    const days = this.state.usage.days;
    const idx = days.findIndex((day) => day.date === this.state.usage.selectedDate);
    const next = days[Math.max(0, Math.min(days.length - 1, idx + delta))];
    if (next) {
      this.cb.onSelectUsageDate(next.date);
    }
  }

  private stepArtifacts(delta: number): void {
    const rows = flattenArtifactRows(this.state.artifacts.tree, this.state.artifacts.expanded);
    const idx = rows.findIndex((row) => row.path === this.state.artifacts.selected);
    const next = rows[Math.max(0, Math.min(rows.length - 1, idx + delta))];
    if (next) {
      this.cb.onSelectArtifact(next.path);
    }
  }

  private mainWidth(totalWidth: number): number {
    return Math.max(20, totalWidth - this.sidebarWidth() - 1);
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
    if (mouse && this.mouseEnabled) {
      if (mouse.wheel) {
        this.handleWheel(mouse.wheel, mouse.col, mouse.row);
      } else if (!mouse.release && !mouse.move && mouse.button === 0) {
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
        enableMouse((s) => this.tui["terminal"]?.write?.(s));
      } else {
        disableMouse((s) => this.tui["terminal"]?.write?.(s));
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
        this.moveLiveLogs(-1);
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.moveLiveLogs(1);
        return;
      }
    }

    if (screen === "accounts") {
      if (data === "a" || data === "A") { this.cb.onAddAccount(); return; }
      if (matchesKey(data, Key.up)) {
        this.stepAccounts(-1);
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.stepAccounts(1);
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
        this.stepUsage(-1);
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.stepUsage(1);
        return;
      }
    }

    if (screen === "artifacts") {
      if (matchesKey(data, Key.up)) {
        this.stepArtifacts(-1);
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.stepArtifacts(1);
        return;
      }
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

  private handleWheel(direction: "up" | "down", col: number, _row: number): void {
    const sbW = this.sidebarWidth();
    const delta = direction === "up" ? -3 : 3;

    if (col < sbW) {
      this.setFocusRegion("sidebar");
      this.cb.dispatch({ type: "sidebar-move", direction: direction === "up" ? "up" : "down" });
      return;
    }

    this.setFocusRegion("main");

    switch (this.state.activeScreen) {
      case "live":
        this.moveLiveLogs(delta);
        break;
      case "accounts":
        this.stepAccounts(direction === "up" ? -1 : 1);
        break;
      case "usage":
        this.stepUsage(direction === "up" ? -1 : 1);
        break;
      case "artifacts":
        this.stepArtifacts(direction === "up" ? -1 : 1);
        break;
      default:
        break;
    }
  }

  private handleLiveClick(localCol: number, localRow: number): void {
    if (localRow >= LIVE_SERVER_ROW - 1 && localRow <= LIVE_SERVER_ROW + 1) {
      const prefix = 2;
      const hit = buttonHitAt(layoutButtonGroup(liveServerButtons(this.state.runtime.serverState)).hits, localCol - prefix);
      if (hit === "start") this.cb.onStartServer();
      if (hit === "stop") this.cb.onStopServer();
      if (hit === "restart") this.cb.onRestartServer();
      return;
    }

    if (localRow >= LIVE_LOG_LEVEL_ROW - 1 && localRow <= LIVE_LOG_LEVEL_ROW + 1) {
      const prefix = 2;
      const hit = buttonHitAt(layoutButtonGroup(liveLogLevelButtons(this.state.live.logLevel)).hits, localCol - prefix);
      if (hit) this.cb.onLogLevelChange(hit as LogLevel);
    }
  }

  private handleAccountsClick(localRow: number): void {
    if (localRow >= ACCOUNTS_ADD_BUTTON_ROW - 1 && localRow <= ACCOUNTS_ADD_BUTTON_ROW + 1) {
      this.cb.onAddAccount();
      return;
    }

    const index = localRow - ACCOUNTS_TABLE_START_ROW;
    const account = this.state.accounts.accounts[index];
    if (account) {
      this.cb.onSelectAccount(account.id);
    }
  }

  private handleUsageClick(localRow: number): void {
    const index = localRow - 8;
    const selected = this.state.usage.days[index];
    if (selected) {
      this.cb.onSelectUsageDate(selected.date);
    }
  }

  private handleArtifactsClick(localCol: number, localRow: number, mainWidth: number): void {
    const { treeWidth } = artifactPaneWidths(mainWidth);
    if (localRow < ARTIFACT_TREE_START_ROW || localCol >= treeWidth) {
      return;
    }

    const rows = flattenArtifactRows(this.state.artifacts.tree, this.state.artifacts.expanded);
    const selected = rows[localRow - ARTIFACT_TREE_START_ROW];
    if (!selected) {
      return;
    }

    this.cb.onSelectArtifact(selected.path);
    if (selected.type === "directory") {
      this.cb.onToggleArtifactExpand(selected.path);
    }
  }

  private handleSettingsClick(localRow: number, localCol: number): void {
    const rowCol = localCol - 2;
    if (rowCol < 0) {
      return;
    }

    if (localRow >= SETTINGS_THEME_ROW - 1 && localRow <= SETTINGS_THEME_ROW + 1) {
      const hit = buttonHitAt(layoutButtonGroup([
        { id: "dark", label: "dark", selected: this.state.themeName === "dark", tone: "accent" },
        { id: "light", label: "light", selected: this.state.themeName === "light", tone: "accent" },
      ]).hits, rowCol);
      if (hit) this.cb.onThemeChange(hit as TuiState["themeName"]);
      return;
    }

    if (localRow >= SETTINGS_SIDEBAR_ROW - 1 && localRow <= SETTINGS_SIDEBAR_ROW + 1) {
      const hit = buttonHitAt(layoutButtonGroup([
        { id: "expanded", label: "expanded", selected: this.state.sidebarMode === "expanded", tone: "accent" },
        { id: "collapsed", label: "collapsed", selected: this.state.sidebarMode === "collapsed", tone: "accent" },
      ]).hits, rowCol);
      if (hit) this.cb.dispatch({ type: "set-sidebar-mode", mode: hit as TuiState["sidebarMode"] });
      return;
    }

    if (localRow >= SETTINGS_ICONS_ROW - 1 && localRow <= SETTINGS_ICONS_ROW + 1) {
      const hit = buttonHitAt(layoutButtonGroup([
        { id: "fallback", label: "fallback", selected: this.state.iconMode === "fallback", tone: "accent" },
        { id: "nerd", label: "nerd", selected: this.state.iconMode === "nerd", tone: "accent" },
      ]).hits, rowCol);
      if (hit) this.cb.dispatch({ type: "set-icon-mode", mode: hit as TuiState["iconMode"] });
      return;
    }

    if (localRow >= SETTINGS_LOG_LEVEL_ROW - 1 && localRow <= SETTINGS_LOG_LEVEL_ROW + 1) {
      const hit = buttonHitAt(layoutButtonGroup([
        { id: "off", label: "off", selected: this.state.live.logLevel === "off", tone: "neutral" },
        { id: "error", label: "error", selected: this.state.live.logLevel === "error", tone: "danger" },
        { id: "error-debug", label: "error-debug", selected: this.state.live.logLevel === "error-debug", tone: "accent" },
        { id: "debug", label: "debug", selected: this.state.live.logLevel === "debug", tone: "success" },
      ]).hits, rowCol);
      if (hit) this.cb.onLogLevelChange(hit as LogLevel);
    }
  }

  private handleClick(col: number, row: number): void {
    const sbW = this.sidebarWidth();
    const termRows = this.tui["terminal"]?.rows ?? this.state.viewportRows;

    if (col < sbW) {
      this.setFocusRegion("sidebar");
      const itemRow = row - 2;
      if (itemRow >= 0 && itemRow < NAV_ITEMS.length) {
        const item = NAV_ITEMS[itemRow];
        if (item) {
          this.navigate(item.id);
        }
        return;
      }
      if (row === termRows - 1) {
        this.cb.dispatch({ type: "toggle-sidebar" });
      }
      return;
    }

    this.setFocusRegion("main");
    const localCol = col - sbW - 1;
    const localRow = row - 1;
    const mainWidth = this.mainWidth(this.state.viewportCols);

    switch (this.state.activeScreen) {
      case "live":
        this.handleLiveClick(localCol, localRow);
        break;
      case "accounts":
        this.handleAccountsClick(localRow);
        break;
      case "usage":
        this.handleUsageClick(localRow);
        break;
      case "artifacts":
        this.handleArtifactsClick(localCol, localRow, mainWidth);
        break;
      case "settings":
        this.handleSettingsClick(localRow, localCol);
        break;
      default:
        break;
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
    const line = `${stateStr}  ${runtime.host}:${String(runtime.port)}  up ${formatDuration(runtime.uptimeMs)}  ${runtime.rotationMode}  ${String(runtime.accountCount)} acc  req ${String(runtime.requestCount)}  streams ${String(runtime.streamCount)}  ${authStr}  ${mouseStr}`;
    return truncLine(line, mainW);
  }

  private renderFooter(mainW: number): string {
    const focusStr = this.state.focusRegion === "sidebar" ? chalk.cyan("sidebar") : chalk.cyan("main");
    const base = caption(`Tab focus(${focusStr})  click select  wheel scroll  [ sidebar  t theme  m mouse  q quit  ? help`);
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
