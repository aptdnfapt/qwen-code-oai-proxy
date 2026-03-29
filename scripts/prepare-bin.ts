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
const COPY_FILE_PAIRS = [
  {
    source: nodePath.join(process.cwd(), "src", "tui2", "package.json"),
    target: nodePath.join(process.cwd(), "dist", "src", "tui2", "package.json"),
  },
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

async function copyFileIfPresent(source: string, target: string): Promise<void> {
  try {
    const content = await fs.readFile(source, "utf8");
    await fs.mkdir(nodePath.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  await Promise.all(BIN_PATHS.map((filePath) => ensureShebang(filePath)));
  await Promise.all(COPY_FILE_PAIRS.map(({ source, target }) => copyFileIfPresent(source, target)));
}

main().catch((error: any) => {
  console.error(`Failed to prepare bin files: ${error.message}`);
  process.exit(1);
});
