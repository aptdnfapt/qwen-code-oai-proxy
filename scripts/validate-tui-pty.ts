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
  keys: string;
  expectedSnippets: readonly string[];
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
    keys: "[q",
    expectedSnippets: Object.freeze(["qwen-proxy", "Live", "streams 0", "[>]", "theme Dark"]),
  }),
  Object.freeze({
    name: "narrow",
    cols: 80,
    rows: 24,
    keys: "q",
    expectedSnippets: Object.freeze(["QP", "Live", "streams 0", "[ toggle", "theme Dark"]),
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

async function runCapture(spec: CaptureSpec): Promise<CaptureResult> {
  const paths = createTempPaths(spec.name);
  const command = [
    `stty rows ${spec.rows} cols ${spec.cols}`,
    `REZI_FRAME_AUDIT=1 REZI_FRAME_AUDIT_LOG=${paths.auditPath} node ${DIST_TUI_ENTRY}`,
  ].join("; ");

  const child = childProcess.spawn("script", ["-qefc", command, paths.rawPath], {
    cwd: PROJECT_ROOT,
    stdio: ["pipe", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  await wait(500);

  for (const key of spec.keys) {
    child.stdin.write(key);
    await wait(250);
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
