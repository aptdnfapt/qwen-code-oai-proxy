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
  const initial = createInitialState(1000);
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
