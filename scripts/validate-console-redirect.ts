#!/usr/bin/env node

const assert = require("node:assert/strict") as typeof import("node:assert/strict");
const nodePath = require("node:path") as typeof import("node:path");

const deepEqual: typeof assert.deepEqual = assert.deepEqual;

type ConsoleLevel = "info" | "warn" | "error" | "debug";

type RedirectModule = {
  enableConsoleRedirect: (callback: (level: ConsoleLevel, message: string) => void) => void;
  disableConsoleRedirect: () => void;
};

const redirect = require(nodePath.join(__dirname, "..", "src", "tui2", "console-redirect.js")) as RedirectModule;

const events: Array<{ level: ConsoleLevel; message: string }> = [];

redirect.enableConsoleRedirect((level, message) => {
  events.push({ level, message });
});

try {
  console.log("\x1b[33m%s\x1b[0m", "Refreshing Qwen access token...");
  console.error("\x1b[31m%s\x1b[0m", "Failed to refresh", "boom");
  console.warn("prefix %d %s", 7, "items");
  console.info("\x1b]0;window-title\x07info line");
  console.debug({ ok: true, nested: { count: 2 } });

  deepEqual(events, [
    { level: "info", message: "Refreshing Qwen access token..." },
    { level: "error", message: "Failed to refresh boom" },
    { level: "warn", message: "prefix 7 items" },
    { level: "info", message: "info line" },
    { level: "debug", message: '{\n  "ok": true,\n  "nested": {\n    "count": 2\n  }\n}' },
  ]);

  console.log("console redirect validation passed");
} finally {
  redirect.disableConsoleRedirect();
}
