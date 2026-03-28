import assert from "assert/strict";
import test from "node:test";
import { resolveGlobalKey } from "../helpers/keybindings.js";

test("keybinding resolver maps quit keys", () => {
  assert.deepEqual(resolveGlobalKey("q"), { kind: "quit" });
  assert.deepEqual(resolveGlobalKey("ctrl+c"), { kind: "quit" });
});

test("keybinding resolver maps sidebar collapse key", () => {
  assert.deepEqual(resolveGlobalKey("["), {
    kind: "action",
    action: { type: "toggle-sidebar" },
  });
});

test("keybinding resolver maps icon mode toggle", () => {
  assert.deepEqual(resolveGlobalKey("i"), {
    kind: "action",
    action: { type: "toggle-icon-mode" },
  });
});

test("keybinding resolver maps theme cycling", () => {
  assert.deepEqual(resolveGlobalKey("t"), {
    kind: "action",
    action: { type: "cycle-theme" },
  });
});

test("keybinding resolver ignores unrelated keys", () => {
  assert.equal(resolveGlobalKey("tab"), null);
});
