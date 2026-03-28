import assert from "assert/strict";
import test from "node:test";
import { resolveGlobalKey } from "../helpers/keybindings.js";

test("keybinding resolver maps quit keys", () => {
  assert.deepEqual(resolveGlobalKey("q", "sidebar"), { kind: "quit" });
  assert.deepEqual(resolveGlobalKey("ctrl+c", "main"), { kind: "quit" });
});

test("keybinding resolver maps sidebar collapse key", () => {
  assert.deepEqual(resolveGlobalKey("[", "sidebar"), {
    kind: "action",
    action: { type: "toggle-sidebar" },
  });
});

test("keybinding resolver maps icon mode toggle", () => {
  assert.deepEqual(resolveGlobalKey("i", "sidebar"), {
    kind: "action",
    action: { type: "toggle-icon-mode" },
  });
});

test("keybinding resolver maps theme cycling", () => {
  assert.deepEqual(resolveGlobalKey("t", "sidebar"), {
    kind: "action",
    action: { type: "cycle-theme" },
  });
});

test("keybinding resolver maps tab to focus-next-region", () => {
  assert.deepEqual(resolveGlobalKey("tab", "sidebar"), {
    kind: "action",
    action: { type: "focus-next-region" },
  });
});

test("keybinding resolver maps shift+tab to focus-prev-region", () => {
  assert.deepEqual(resolveGlobalKey("shift+tab", "main"), {
    kind: "action",
    action: { type: "focus-prev-region" },
  });
});

test("keybinding resolver maps arrow keys when sidebar focused", () => {
  assert.deepEqual(resolveGlobalKey("up", "sidebar"), {
    kind: "action",
    action: { type: "sidebar-move", direction: "up" },
  });
  assert.deepEqual(resolveGlobalKey("down", "sidebar"), {
    kind: "action",
    action: { type: "sidebar-move", direction: "down" },
  });
});

test("keybinding resolver maps enter to sidebar-activate when sidebar focused", () => {
  assert.deepEqual(resolveGlobalKey("enter", "sidebar"), {
    kind: "action",
    action: { type: "sidebar-activate" },
  });
});

test("keybinding resolver ignores arrow keys when main focused", () => {
  assert.equal(resolveGlobalKey("up", "main"), null);
  assert.equal(resolveGlobalKey("down", "main"), null);
  assert.equal(resolveGlobalKey("enter", "main"), null);
});

test("keybinding resolver maps ? and h to help navigation", () => {
  assert.deepEqual(resolveGlobalKey("?", "sidebar"), { kind: "navigate", screen: "help" });
  assert.deepEqual(resolveGlobalKey("h", "main"), { kind: "navigate", screen: "help" });
});

test("keybinding resolver ignores unrelated keys", () => {
  assert.equal(resolveGlobalKey("x", "sidebar"), null);
  assert.equal(resolveGlobalKey("z", "main"), null);
});
