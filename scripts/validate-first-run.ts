#!/usr/bin/env node

export {};

const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
const fsPromises = require("node:fs/promises") as typeof import("node:fs/promises");
const os = require("node:os") as typeof import("node:os");
const path = require("node:path") as typeof import("node:path");

async function main(): Promise<void> {
  const tempHome = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qwen-proxy-first-run-"));
  const runtimeScript = `
    (async () => {
      const { QwenAuthManager } = require(${JSON.stringify(path.join(process.cwd(), "dist", "src", "qwen", "auth.js"))});
      const { QwenAPI } = require(${JSON.stringify(path.join(process.cwd(), "dist", "src", "qwen", "api.js"))});
      const authManager = new QwenAuthManager();
      await authManager.loadAllAccounts();
      await authManager.loadAllAccounts();
      const api = new QwenAPI();
      await api.loadRequestCounts();
      await api.incrementRequestCount("default");
      await api.incrementWebSearchRequestCount("default");
      await api.incrementWebSearchResultCount("default", 2);
      await api.recordTokenUsage("default", { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 });
      await api.saveRequestCounts();
      console.log("first-run ok");
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
  `;

  const result = spawnSync(process.execPath, ["-e", runtimeScript], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: tempHome,
      USERPROFILE: tempHome,
    },
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error("fresh-home runtime validation failed");
  }

  if (result.stdout.includes("Failed to load multi-account credentials") || result.stderr.includes("Failed to load multi-account credentials")) {
    throw new Error("fresh-home auth validation emitted missing-directory warnings");
  }

  await fsPromises.access(path.join(tempHome, ".local", "share", "qwen-proxy", "usage.db"));
  console.log("first-run usage store validation passed");
}

void main().catch((error: any) => {
  console.error(error.message);
  process.exit(1);
});
