#!/usr/bin/env node

export {};

const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
const fsPromises = require("node:fs/promises") as typeof import("node:fs/promises");
const os = require("node:os") as typeof import("node:os");
const path = require("node:path") as typeof import("node:path");

async function main(): Promise<void> {
  const tempHome = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qwen-proxy-auth-home-"));
  const probeScript = `
    (async () => {
      const { QwenAuthManager } = require(${JSON.stringify(path.join(process.cwd(), "dist", "src", "qwen", "auth.js"))});
      const manager = new QwenAuthManager();
      await manager.loadAllAccounts();
      await manager.loadAllAccounts();
      const defaultCreds = await manager.loadCredentials();
      if (defaultCreds !== null) {
        throw new Error('expected no default credentials in clean HOME');
      }
      console.log('clean-home auth ok');
    })().catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
  `;

  const result = spawnSync(process.execPath, ["-e", probeScript], {
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
    throw new Error("clean-home auth validation failed");
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  if (combinedOutput.includes("Failed to load multi-account credentials") || combinedOutput.includes("ENOENT")) {
    throw new Error("clean-home auth validation emitted missing-path warnings");
  }

  console.log("clean-home auth validation passed");
}

void main().catch((error: any) => {
  console.error(error.message);
  process.exit(1);
});
