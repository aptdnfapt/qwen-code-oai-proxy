import assert from "assert/strict";
import test from "node:test";
import type { RouteRenderContext, RouterApi } from "@rezi-ui/core";
import { createTestRenderer } from "@rezi-ui/core";
import { createInitialState, reduceTuiState } from "../helpers/state.js";
import { renderAccountsScreen } from "../screens/accounts.js";
import { renderLiveScreen } from "../screens/live.js";
import { renderUsageScreen } from "../screens/usage.js";
import { themeSpec } from "../theme.js";
import type { LogLevel, ScreenId, ScreenRouteDeps, TuiState } from "../types.js";

function createRouter(initialRoute: ScreenId): RouterApi {
  return {
    navigate: () => {},
    replace: () => {},
    back: () => {},
    currentRoute: () => ({ id: initialRoute, params: Object.freeze({}) }),
    canGoBack: () => false,
    history: () => Object.freeze([{ id: initialRoute, params: Object.freeze({}) }]),
  };
}

function createContext(state: TuiState, routeId: ScreenId): RouteRenderContext<TuiState> {
  return {
    router: createRouter(routeId),
    state,
    update: () => {},
    outlet: null,
  };
}

type LiveScreenDeps = ScreenRouteDeps & {
  onStartServer: () => void;
  onStopServer: () => void;
  onRestartServer: () => void;
  onLogLevelChange: (level: LogLevel) => void;
  onLogsScroll: (scrollTop: number) => void;
};

type AccountsScreenDeps = ScreenRouteDeps & {
  onSelect: (id: string | null) => void;
  onAddAccount: () => void;
  onOpenAuthBrowser: () => void;
  onCloseAuthModal: () => void;
  onAuthAccountIdChange: (accountId: string) => void;
  onStartAccountAuth: () => void;
  onRefreshAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
};

type UsageScreenDeps = ScreenRouteDeps & {
  onSelectDate: (date: string | null) => void;
  onFilterChange: (value: string) => void;
};

function createLiveDeps(): LiveScreenDeps {
  return {
    onNavigate: () => {},
    onToggleSidebar: () => {},
    onStartServer: () => {},
    onStopServer: () => {},
    onRestartServer: () => {},
    onLogLevelChange: () => {},
    onLogsScroll: () => {},
  };
}

function createAccountsDeps(): AccountsScreenDeps {
  return {
    onNavigate: () => {},
    onToggleSidebar: () => {},
    onSelect: () => {},
    onAddAccount: () => {},
    onOpenAuthBrowser: () => {},
    onCloseAuthModal: () => {},
    onAuthAccountIdChange: () => {},
    onStartAccountAuth: () => {},
    onRefreshAccount: () => {},
    onRemoveAccount: () => {},
  };
}

function createUsageDeps(): UsageScreenDeps {
  return {
    onNavigate: () => {},
    onToggleSidebar: () => {},
    onSelectDate: () => {},
    onFilterChange: () => {},
  };
}

test("live screen renders full shell markers at 160x40", () => {
  const base = createInitialState(1000);
  const sized = reduceTuiState(base, { type: "set-viewport", cols: 160, rows: 40 });
  const state = reduceTuiState(sized, {
    type: "set-runtime",
    runtime: {
      serverState: "running",
      status: "ready",
      host: "127.0.0.1",
      port: 38471,
      uptimeMs: 21000,
      rotationMode: "RR",
      accountCount: 10,
      requestCount: 2,
      streamCount: 0,
    },
  });
  const renderer = createTestRenderer({ viewport: { cols: 160, rows: 40 } });
  const output = renderer.render(renderLiveScreen(createContext(state, "live"), createLiveDeps())).toText();

  assert.match(output, /qwen-proxy/);
  assert.match(output, /READY/);
  assert.match(output, /host 127.0.0.1:38471/);
  assert.match(output, /LV Live/);
  assert.match(output, /\[<\] collapse/);
  assert.doesNotMatch(output, /\[\[]/);
  assert.match(output, /Tab focus/);
  assert.match(output, /focus:sidebar/);
  assert.match(output, /NAV FOCUS/);
  assert.match(output, /Workspace details/);
  assert.match(output, /viewport 160x40/);
  assert.doesNotMatch(output, /Shell snapshot/);
});

test("live screen stays compact when sidebar is collapsed at 80x24", () => {
  const base = createInitialState(1000);
  const collapsed = reduceTuiState(base, { type: "toggle-sidebar" });
  const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
  const output = renderer.render(renderLiveScreen(createContext(collapsed, "live"), createLiveDeps())).toText();

  assert.match(output, /QP/);
  assert.match(output, /\[>\]/);
  assert.match(output, /NO AUTH/);
  assert.match(output, /Log level/);
  assert.match(output, /streams 0/);
});

test("live screen renders under the light theme", () => {
  const base = createInitialState(1000);
  const light = reduceTuiState(base, { type: "cycle-theme" });
  const renderer = createTestRenderer({
    viewport: { cols: 120, rows: 32 },
    theme: themeSpec(light.themeName).theme,
  });
  const output = renderer.render(renderLiveScreen(createContext(light, "live"), createLiveDeps())).toText();

  assert.match(output, /theme Light/);
  assert.match(output, /Log level/);
});

test("live screen marks the primary server action when main pane is focused", () => {
  const base = createInitialState(1000);
  const mainFocused = reduceTuiState(base, { type: "focus-next-region" });
  const renderer = createTestRenderer({ viewport: { cols: 160, rows: 40 } });
  const output = renderer.render(renderLiveScreen(createContext(mainFocused, "live"), createLiveDeps())).toText();

  assert.match(output, /MAIN FOCUS/);
  assert.match(output, /> Start/);
});

test("accounts screen shows auth modal with waiting details", () => {
  let state = createInitialState(1000);
  state = reduceTuiState(state, {
    type: "set-accounts",
    accounts: Object.freeze([
      Object.freeze({ id: "work", status: "valid", expiresAt: 2_000_000, todayRequests: 12 }),
    ]),
  });
  state = reduceTuiState(state, { type: "open-auth-modal" });
  state = reduceTuiState(state, { type: "set-auth-account-id", accountId: "ops" });
  state = reduceTuiState(state, {
    type: "auth-device-flow-ready",
    message: "Open link or scan QR, then approve in browser.",
    flow: Object.freeze({
      verificationUri: "https://chat.qwen.ai/verify",
      verificationUriComplete: "https://chat.qwen.ai/verify?user_code=ABCD-EFGH",
      userCode: "ABCD-EFGH",
      deviceCode: "device-code",
      codeVerifier: "code-verifier",
      qrText: "██\n██",
    }),
  });

  const renderer = createTestRenderer({ viewport: { cols: 160, rows: 40 } });
  const output = renderer.render(renderAccountsScreen(createContext(state, "accounts"), createAccountsDeps())).toText();

  assert.match(output, /Add account/);
  assert.match(output, /WAITING/);
  assert.match(output, /ABCD-EFGH/);
  assert.match(output, /Verification link/);
  assert.match(output, /Open browser/);
  assert.match(output, /Close/);
});

test("usage screen renders cache metrics, cache type, and filter", () => {
  const today = new Date().toISOString().split("T")[0] as string;
  let state = createInitialState(1000);
  state = reduceTuiState(state, {
    type: "set-usage-days",
    days: Object.freeze([
      Object.freeze({
        date: today,
        requests: 12,
        requestsKnown: true,
        requestFloor: 12,
        inputTokens: 1200,
        outputTokens: 640,
        cacheReadTokens: 900,
        cacheWriteTokens: 300,
        cacheTypeLabel: "ephemeral",
        cacheHitRate: 0.75,
      }),
      Object.freeze({
        date: "2026-03-27",
        requests: 7,
        requestsKnown: true,
        requestFloor: 7,
        inputTokens: 700,
        outputTokens: 320,
        cacheReadTokens: 100,
        cacheWriteTokens: 100,
        cacheTypeLabel: "mixed",
        cacheHitRate: 0.5,
      }),
    ]),
  });
  state = reduceTuiState(state, { type: "set-usage-filter", value: today });

  const renderer = createTestRenderer({ viewport: { cols: 160, rows: 40 } });
  const output = renderer.render(renderUsageScreen(createContext(state, "usage"), createUsageDeps())).toText();

  assert.match(output, /Search \/ fi/);
  assert.match(output, /cache read 900/);
  assert.match(output, /cache write 300/);
  assert.match(output, /cache type ephemeral/);
  assert.match(output, /Today:/);
  assert.match(output, /75%/);
  assert.match(output, new RegExp(today.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(output, /2026-03-27/);
});

test("usage screen renders under the light theme", () => {
  const today = new Date().toISOString().split("T")[0] as string;
  let state = createInitialState(1000);
  state = reduceTuiState(state, { type: "cycle-theme" });
  state = reduceTuiState(state, {
    type: "set-usage-days",
    days: Object.freeze([
      Object.freeze({
        date: today,
        requests: 2,
        requestsKnown: true,
        requestFloor: 2,
        inputTokens: 40,
        outputTokens: 20,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        cacheTypeLabel: "ephemeral",
        cacheHitRate: 10 / 15,
      }),
    ]),
  });

  const renderer = createTestRenderer({
    viewport: { cols: 160, rows: 40 },
    theme: themeSpec(state.themeName).theme,
  });
  const output = renderer.render(renderUsageScreen(createContext(state, "usage"), createUsageDeps())).toText();

  assert.match(output, /theme Light/);
  assert.match(output, /Today:/);
  assert.match(output, /cache type ephemeral/);
});
