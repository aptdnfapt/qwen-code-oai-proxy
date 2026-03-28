import assert from "assert/strict";
import test from "node:test";
import type { RouteRenderContext, RouterApi } from "@rezi-ui/core";
import { createTestRenderer } from "@rezi-ui/core";
import { createInitialState, reduceTuiState } from "../helpers/state.js";
import { renderLiveScreen } from "../screens/live.js";
import { themeSpec } from "../theme.js";
import type { ScreenId, ScreenRouteDeps, TuiState } from "../types.js";

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

function createDeps(): ScreenRouteDeps {
  return {
    onNavigate: () => {},
    onToggleSidebar: () => {},
  };
}

test("live screen renders full shell markers at 160x40", () => {
  const base = createInitialState(1000);
  const sized = reduceTuiState(base, { type: "set-viewport", cols: 160, rows: 40 });
  const state = reduceTuiState(sized, {
    type: "set-runtime",
    runtime: {
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
  const output = renderer.render(renderLiveScreen(createContext(state, "live"), createDeps())).toText();

  assert.match(output, /qwen-proxy/);
  assert.match(output, /READY/);
  assert.match(output, /host 127.0.0.1:38471/);
  assert.match(output, /LV Live/);
  assert.match(output, /Shell snapshot/);
  assert.match(output, /\[<\] collapse/);
  assert.doesNotMatch(output, /\[\[]/);
  assert.match(output, /click sidebar to navigate/);
});

test("live screen stays compact when sidebar is collapsed at 80x24", () => {
  const base = createInitialState(1000);
  const collapsed = reduceTuiState(base, { type: "toggle-sidebar" });
  const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
  const output = renderer.render(renderLiveScreen(createContext(collapsed, "live"), createDeps())).toText();

  assert.match(output, /QP/);
  assert.match(output, /\[>\]/);
  assert.match(output, /NO AUTH/);
  assert.match(output, /Phase 5A shell scaffold/);
  assert.match(output, /streams 0/);
});

test("live screen renders under the light theme", () => {
  const base = createInitialState(1000);
  const light = reduceTuiState(base, { type: "cycle-theme" });
  const renderer = createTestRenderer({
    viewport: { cols: 120, rows: 32 },
    theme: themeSpec(light.themeName).theme,
  });
  const output = renderer.render(renderLiveScreen(createContext(light, "live"), createDeps())).toText();

  assert.match(output, /theme Light/);
  assert.match(output, /Phase 5A shell scaffold/);
});
