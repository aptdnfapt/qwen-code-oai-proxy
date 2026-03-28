#!/usr/bin/env node

const fs = require("node:fs") as typeof import("node:fs");
const os = require("node:os") as typeof import("node:os");
const nodePath = require("node:path") as typeof import("node:path");
const childProcess = require("node:child_process") as typeof import("node:child_process");

export {};

type CaptureSpec = Readonly<{
  name: string;
  cols: number;
  rows: number;
  inputs: readonly string[];
  expectedSnippets: readonly string[];
  fixtureKind?: "usage-cache";
}>;

type CaptureResult = Readonly<{
  name: string;
  text: string;
  auditSummary: string;
}>;

const STRIP_ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g;
const PROJECT_ROOT = nodePath.resolve(__dirname, "..");
const DIST_TUI_ENTRY = nodePath.join(PROJECT_ROOT, "dist", "src", "tui", "main.js");
const FRAME_AUDIT_REPORT = nodePath.join(PROJECT_ROOT, "Rezi", "scripts", "frame-audit-report.mjs");

const CAPTURES: readonly CaptureSpec[] = Object.freeze([
  Object.freeze({
    name: "wide",
    cols: 160,
    rows: 40,
    inputs: Object.freeze(["[", "q"]),
    expectedSnippets: Object.freeze(["qwen-proxy", "Live", "streams 0", "[>]", "theme Dark"]),
  }),
  Object.freeze({
    name: "narrow",
    cols: 80,
    rows: 24,
    inputs: Object.freeze(["q"]),
    expectedSnippets: Object.freeze(["QP", "Live", "streams 0", "Tab focus", "theme Dark"]),
  }),
  Object.freeze({
    name: "light",
    cols: 160,
    rows: 40,
    inputs: Object.freeze(["t", "q"]),
    expectedSnippets: Object.freeze(["qwen-proxy", "Live", "streams 0", "theme Light", "[<] collapse"]),
  }),
  Object.freeze({
    name: "focus-indicator",
    cols: 160,
    rows: 40,
    inputs: Object.freeze(["q"]),
    expectedSnippets: Object.freeze(["focus:sidebar", "Tab focus"]),
  }),
  Object.freeze({
    name: "auth-modal",
    cols: 160,
    rows: 40,
    inputs: Object.freeze(["\u001b[B", "\u001b[B", "\r", "a", "\u001b", "q"]),
    expectedSnippets: Object.freeze(["Accounts", "Add account", "Account ID", "Start auth"]),
  }),
  Object.freeze({
    name: "usage-cache-metrics",
    cols: 160,
    rows: 40,
    inputs: Object.freeze(["\u001b[B", "\u001b[B", "\u001b[B", "\r", "q"]),
    expectedSnippets: Object.freeze(["Usage", "cache read 900", "cache write 300", "cache type ephemeral", "Today:  req 4"]),
    fixtureKind: "usage-cache",
  }),
  Object.freeze({
    name: "usage-cache-metrics-light",
    cols: 160,
    rows: 40,
    inputs: Object.freeze(["t", "\u001b[B", "\u001b[B", "\u001b[B", "\r", "q"]),
    expectedSnippets: Object.freeze(["Usage", "theme Light", "cache read 900", "cache type ephemeral", "Today:  req 4"]),
    fixtureKind: "usage-cache",
  }),
]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createTempPaths(name: string): { rawPath: string; auditPath: string } {
  const baseDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), `qwen-tui-${name}-`));
  return {
    rawPath: nodePath.join(baseDir, `${name}.typescript`),
    auditPath: nodePath.join(baseDir, `${name}.audit.ndjson`),
  };
}

function createUsageFixtureHome(name: string): string {
  const baseDir = fs.mkdtempSync(nodePath.join(os.tmpdir(), `qwen-tui-fixture-${name}-`));
  const qwenDir = nodePath.join(baseDir, ".qwen");
  fs.mkdirSync(qwenDir, { recursive: true });

  const today = new Date().toISOString().split("T")[0] as string;
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

  fs.writeFileSync(
    nodePath.join(qwenDir, "oauth_creds.json"),
    JSON.stringify(
      {
        access_token: "fixture-token",
        expiry_date: Date.now() + 60 * 60 * 1000,
      },
      null,
      2,
    ),
  );

  fs.writeFileSync(
    nodePath.join(qwenDir, "request_counts.json"),
    JSON.stringify(
      {
        lastResetDate: today,
        requests: {
          default: 4,
        },
        tokenUsage: {
          default: [
            {
              date: today,
              requests: 4,
              requestsKnown: true,
              inputTokens: 1200,
              outputTokens: 640,
              cacheReadTokens: 900,
              cacheWriteTokens: 300,
              cacheTypes: ["ephemeral"],
            },
            {
              date: yesterday,
              requests: 2,
              requestsKnown: true,
              inputTokens: 600,
              outputTokens: 220,
              cacheReadTokens: 120,
              cacheWriteTokens: 80,
              cacheTypes: ["mixed"],
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  return baseDir;
}

async function runCapture(spec: CaptureSpec): Promise<CaptureResult> {
  const paths = createTempPaths(spec.name);
  const fixtureHome = spec.fixtureKind === "usage-cache" ? createUsageFixtureHome(spec.name) : null;
  const command = [
    `stty rows ${spec.rows} cols ${spec.cols}`,
    `REZI_FRAME_AUDIT=1 REZI_FRAME_AUDIT_LOG=${paths.auditPath} node ${DIST_TUI_ENTRY}`,
  ].join("; ");

  const child = childProcess.spawn("script", ["-qefc", command, paths.rawPath], {
    cwd: PROJECT_ROOT,
    env: fixtureHome ? { ...process.env, HOME: fixtureHome } : process.env,
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  await wait(800);

  for (const input of spec.inputs) {
    child.stdin.write(input);
    await wait(400);
  }

  child.stdin.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new Error(`PTY capture '${spec.name}' failed with exit ${exitCode}: ${stderr.trim()}`);
  }

  const rawText = fs.readFileSync(paths.rawPath, "utf8");
  const normalizedText = rawText
    .replace(STRIP_ANSI_PATTERN, "")
    .replace(/\r/g, "\n")
    .replace(/Script started on.*\n/g, "")
    .replace(/Script done on.*\n/g, "")
    .replace(/>0q>c/g, "")
    .trim();

  for (const snippet of spec.expectedSnippets) {
    if (!normalizedText.includes(snippet)) {
      throw new Error(`PTY capture '${spec.name}' missing snippet: ${snippet}`);
    }
  }

  const audit = childProcess.spawnSync("node", [FRAME_AUDIT_REPORT, paths.auditPath, "--latest-pid"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });

  if (audit.status !== 0) {
    throw new Error(`Frame audit failed for '${spec.name}': ${audit.stderr || audit.stdout}`);
  }

  if (!audit.stdout.includes("hash_mismatch_backend_vs_worker=0")) {
    throw new Error(`Frame audit mismatch detected for '${spec.name}': ${audit.stdout}`);
  }

  return Object.freeze({
    name: spec.name,
    text: normalizedText,
    auditSummary: audit.stdout.trim(),
  });
}

async function main(): Promise<void> {
  const results: CaptureResult[] = [];

  for (const spec of CAPTURES) {
    results.push(await runCapture(spec));
  }

  for (const result of results) {
    console.log(`ok tui-pty ${result.name}`);
    console.log(result.auditSummary);
  }

  console.log("tui pty validation passed");
}

void main().catch((error: any) => {
  console.error(error.message);
  process.exit(1);
});
