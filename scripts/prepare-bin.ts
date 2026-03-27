#!/usr/bin/env node

export {};

const { promises: fs } = require("node:fs") as typeof import("node:fs");
const nodePath = require("node:path") as typeof import("node:path");

const SHEBANG = "#!/usr/bin/env node\n";
const BIN_PATHS = [
  nodePath.join(process.cwd(), "dist", "src", "cli", "qwen-proxy.js"),
  nodePath.join(process.cwd(), "dist", "authenticate.js"),
  nodePath.join(process.cwd(), "dist", "usage.js"),
];

async function ensureShebang(filePath: string): Promise<void> {
  const current = await fs.readFile(filePath, "utf8");
  if (!current.startsWith(SHEBANG)) {
    await fs.writeFile(filePath, `${SHEBANG}${current}`, "utf8");
  }

  if (process.platform !== "win32") {
    await fs.chmod(filePath, 0o755);
  }
}

async function main(): Promise<void> {
  await Promise.all(BIN_PATHS.map((filePath) => ensureShebang(filePath)));
}

main().catch((error: any) => {
  console.error(`Failed to prepare bin files: ${error.message}`);
  process.exit(1);
});
