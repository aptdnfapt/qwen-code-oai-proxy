#!/usr/bin/env node

export {};

const { spawn, spawnSync } = require("node:child_process") as typeof import("node:child_process");
const fs = require("node:fs") as typeof import("node:fs");
const fsPromises = require("node:fs/promises") as typeof import("node:fs/promises");
const net = require("node:net") as typeof import("node:net");
const os = require("node:os") as typeof import("node:os");
const path = require("node:path") as typeof import("node:path");

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()): string {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

async function allocatePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to allocate test port")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }

      lastError = `health check returned ${response.status}`;
    } catch (error: any) {
      lastError = error.message;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(lastError || "health check timed out");
}

async function stopProcess(child: import("node:child_process").ChildProcess): Promise<void> {
  const exitPromise = new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });

  child.kill("SIGTERM");

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("installed CLI did not stop after SIGTERM")), 10000);
  });

  await Promise.race([exitPromise, timeoutPromise]);
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const tempHome = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qwen-proxy-home-"));
  const tempPrefix = await fsPromises.mkdtemp(path.join(os.tmpdir(), "qwen-proxy-prefix-"));
  const logPath = path.join(os.tmpdir(), `qwen-proxy-install-smoke-${process.pid}.log`);
  const env = {
    ...process.env,
    HOME: tempHome,
    USERPROFILE: tempHome,
    LOG_LEVEL: "error",
  };

  const tarballName = runCommand("npm", ["pack", "--ignore-scripts"], env, projectRoot)
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .pop();

  if (!tarballName) {
    throw new Error("npm pack did not return a tarball name");
  }

  const tarballPath = path.join(projectRoot, tarballName);

  try {
    runCommand("npm", ["install", "-g", "--prefix", tempPrefix, tarballPath], env, projectRoot);

    const binaryPath = path.join(tempPrefix, "bin", "qwen-proxy");
    runCommand(binaryPath, ["version"], env, projectRoot);

    const port = await allocatePort();
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const child = spawn(binaryPath, ["serve", "--headless", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    try {
      await waitForHealth(`http://127.0.0.1:${port}/health`, 15000);
      await stopProcess(child);
    } finally {
      logStream.end();
    }

    await fsPromises.access(path.join(tempHome, ".local", "share", "qwen-proxy", "usage.db"));
    console.log("packaged install smoke test passed");
  } finally {
    await fsPromises.rm(tarballPath, { force: true });
  }
}

void main().catch((error: any) => {
  console.error(error.message);
  process.exit(1);
});
