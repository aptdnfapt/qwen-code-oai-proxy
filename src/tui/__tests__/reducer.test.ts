import assert from "assert/strict";
import test from "node:test";
import { createInitialState, reduceTuiState } from "../helpers/state.js";

test("reducer toggles sidebar mode", () => {
  const initial = createInitialState(1000);
  const next = reduceTuiState(initial, { type: "toggle-sidebar" });

  assert.equal(initial.sidebarMode, "expanded");
  assert.equal(next.sidebarMode, "collapsed");
});

test("reducer toggles icon mode", () => {
  const initial = createInitialState(1000);
  const next = reduceTuiState(initial, { type: "toggle-icon-mode" });

  assert.equal(initial.iconMode, "fallback");
  assert.equal(next.iconMode, "nerd");
});

test("reducer tracks viewport changes", () => {
  const initial = createInitialState(1000);
  const next = reduceTuiState(initial, { type: "set-viewport", cols: 80, rows: 24 });

  assert.equal(next.viewportCols, 80);
  assert.equal(next.viewportRows, 24);
});

test("reducer updates active screen without mutating prior state", () => {
  const initial = createInitialState(1000);
  const next = reduceTuiState(initial, { type: "navigate", screen: "usage" });

  assert.equal(initial.activeScreen, "live");
  assert.equal(next.activeScreen, "usage");
});

test("reducer rolls runtime uptime forward on tick", () => {
  const initial = reduceTuiState(createInitialState(1000), {
    type: "set-runtime",
    runtime: {
      serverState: "running",
      status: "ready",
      host: "127.0.0.1",
      port: 8080,
      uptimeMs: 0,
      rotationMode: "single",
      accountCount: 1,
      requestCount: 0,
      streamCount: 0,
    },
  });
  const next = reduceTuiState(initial, { type: "tick", nowMs: 4000 });

  assert.equal(next.nowMs, 4000);
  assert.equal(next.runtime.uptimeMs, 3000);
});

test("reducer marks quit intent", () => {
  const initial = createInitialState(1000);
  const next = reduceTuiState(initial, { type: "request-quit" });

  assert.equal(initial.shouldQuit, false);
  assert.equal(next.shouldQuit, true);
});

test("reducer cycles between dark and light themes", () => {
  const initial = createInitialState(1000);
  const next = reduceTuiState(initial, { type: "cycle-theme" });

  assert.equal(initial.themeName, "dark");
  assert.equal(next.themeName, "light");
});

test("reducer applies explicit theme, sidebar, and icon selections", () => {
  let state = createInitialState(1000);
  state = reduceTuiState(state, { type: "set-theme", theme: "light" });
  state = reduceTuiState(state, { type: "set-sidebar-mode", mode: "collapsed" });
  state = reduceTuiState(state, { type: "set-icon-mode", mode: "nerd" });

  assert.equal(state.themeName, "light");
  assert.equal(state.sidebarMode, "collapsed");
  assert.equal(state.iconMode, "nerd");
});

test("reducer switches focus region forward with focus-next-region", () => {
  const initial = createInitialState(1000);
  assert.equal(initial.focusRegion, "sidebar");

  const next = reduceTuiState(initial, { type: "focus-next-region" });
  assert.equal(next.focusRegion, "main");

  const back = reduceTuiState(next, { type: "focus-next-region" });
  assert.equal(back.focusRegion, "sidebar");
});

test("reducer switches focus region backward with focus-prev-region", () => {
  const initial = createInitialState(1000);
  const toMain = reduceTuiState(initial, { type: "focus-next-region" });
  assert.equal(toMain.focusRegion, "main");

  const backToSidebar = reduceTuiState(toMain, { type: "focus-prev-region" });
  assert.equal(backToSidebar.focusRegion, "sidebar");
});

test("reducer moves sidebar selection up and down", () => {
  const initial = createInitialState(1000);
  assert.equal(initial.sidebarIndex, 0);

  const down1 = reduceTuiState(initial, { type: "sidebar-move", direction: "down" });
  assert.equal(down1.sidebarIndex, 1);

  const down2 = reduceTuiState(down1, { type: "sidebar-move", direction: "down" });
  assert.equal(down2.sidebarIndex, 2);

  const up1 = reduceTuiState(down2, { type: "sidebar-move", direction: "up" });
  assert.equal(up1.sidebarIndex, 1);
});

test("reducer clamps sidebar index at boundaries", () => {
  const initial = createInitialState(1000);
  const tryUp = reduceTuiState(initial, { type: "sidebar-move", direction: "up" });
  assert.equal(tryUp.sidebarIndex, 0);

  // Move to last item (index 5 for 6 items)
  let state = initial;
  for (let i = 0; i < 10; i++) {
    state = reduceTuiState(state, { type: "sidebar-move", direction: "down" });
  }
  assert.equal(state.sidebarIndex, 5);
});

test("reducer activates screen from sidebar index", () => {
  const initial = createInitialState(1000);
  const moved = reduceTuiState(initial, { type: "sidebar-move", direction: "down" });
  assert.equal(moved.sidebarIndex, 1);

  const activated = reduceTuiState(moved, { type: "sidebar-activate" });
  assert.equal(activated.activeScreen, "artifacts");
});

test("reducer opens and closes auth modal", () => {
  const initial = createInitialState(1000);
  const opened = reduceTuiState(initial, { type: "open-auth-modal" });
  assert.equal(opened.accounts.authModal.isOpen, true);
  assert.equal(opened.accounts.authModal.phase, "idle");

  const closed = reduceTuiState(opened, { type: "close-auth-modal" });
  assert.equal(closed.accounts.authModal.isOpen, false);
  assert.equal(closed.accounts.authModal.accountId, "");
});

test("reducer tracks auth modal account id and waiting flow", () => {
  const initial = reduceTuiState(createInitialState(1000), { type: "open-auth-modal" });
  const named = reduceTuiState(initial, { type: "set-auth-account-id", accountId: "ops" });
  assert.equal(named.accounts.authModal.accountId, "ops");

  const waiting = reduceTuiState(named, {
    type: "auth-device-flow-ready",
    message: "Waiting for approval",
    flow: Object.freeze({
      verificationUri: "https://chat.qwen.ai/verify",
      verificationUriComplete: "https://chat.qwen.ai/verify?user_code=ABCD-EFGH",
      userCode: "ABCD-EFGH",
      deviceCode: "device-code",
      codeVerifier: "code-verifier",
      qrText: "██\n██",
    }),
  });

  assert.equal(waiting.accounts.authModal.phase, "waiting");
  assert.equal(waiting.accounts.authModal.flow?.userCode, "ABCD-EFGH");
});

test("reducer keeps selected account when account list refreshes", () => {
  let state = createInitialState(1000);
  state = reduceTuiState(state, {
    type: "set-accounts",
    accounts: Object.freeze([
      Object.freeze({ id: "work", status: "valid", expiresAt: 2_000_000, todayRequests: 2 }),
      Object.freeze({ id: "ops", status: "expired", expiresAt: 3_000_000, todayRequests: 1 }),
    ]),
  });
  state = reduceTuiState(state, { type: "select-account", id: "ops" });

  const refreshed = reduceTuiState(state, {
    type: "set-accounts",
    accounts: Object.freeze([
      Object.freeze({ id: "work", status: "valid", expiresAt: 2_000_000, todayRequests: 4 }),
      Object.freeze({ id: "ops", status: "valid", expiresAt: 4_000_000, todayRequests: 3 }),
    ]),
  });

  assert.equal(refreshed.accounts.selectedId, "ops");
});

test("reducer keeps usage selection and updates filter", () => {
  let state = createInitialState(1000);
  state = reduceTuiState(state, {
    type: "set-usage-days",
    days: Object.freeze([
      Object.freeze({
        date: "2026-03-28",
        requests: 5,
        requestsKnown: true,
        requestFloor: 5,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 25,
        cacheWriteTokens: 5,
        cacheTypeLabel: "ephemeral",
        cacheHitRate: 25 / 30,
      }),
      Object.freeze({
        date: "2026-03-27",
        requests: 3,
        requestsKnown: true,
        requestFloor: 3,
        inputTokens: 80,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 10,
        cacheTypeLabel: "mixed",
        cacheHitRate: 0.5,
      }),
    ]),
  });

  assert.equal(state.usage.selectedDate, "2026-03-28");

  state = reduceTuiState(state, { type: "select-usage-date", date: "2026-03-27" });
  state = reduceTuiState(state, { type: "set-usage-filter", value: "ephemeral" });

  assert.equal(state.usage.selectedDate, "2026-03-27");
  assert.equal(state.usage.filterQuery, "ephemeral");
});
