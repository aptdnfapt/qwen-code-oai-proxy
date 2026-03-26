#!/usr/bin/env node

const path = require("node:path") as typeof import("node:path");

const modulePaths = [
  "../src/config.js",
  "../src/qwen/auth.js",
  "../src/qwen/api.js",
  "../src/utils/fileLogger.js",
  "../src/utils/liveLogger.js",
  "../src/utils/errorFormatter.js",
  "../src/utils/tokenCounter.js",
  "../src/mcp.js",
  "../src/server/middleware/api-key.js",
  "../src/server/proxy-controller.js",
  "../src/server/health-handler.js",
  "../src/server/lifecycle.js",
  "../src/server/typed-core-bridge.js",
  "../src/server/headless-runtime.js",
  "../src/cli/qwen-proxy.js",
  "../authenticate.js",
  "../usage.js",
];

function loadModule(relativePath: string): any {
  const resolvedPath = path.join(__dirname, relativePath);
  return require(resolvedPath);
}

function main(): void {
  let failed = false;
  for (const modulePath of modulePaths) {
    try {
      loadModule(modulePath);
      console.log(`ok ${modulePath}`);
    } catch (error: any) {
      failed = true;
      console.error(`fail ${modulePath}: ${error.message}`);
    }
  }

  if (failed) {
    process.exit(1);
  }

  console.log("runtime module validation passed");
}

main();
