#!/usr/bin/env node

const packageJson = require("../../../package.json") as { version: string };
const { runAuthCommand } = require("../../authenticate.js") as any;
const { runUsageCommand } = require("../../usage.js") as any;
const { startHeadlessServer } = require("../server/headless-runtime.js") as any;

async function startTui(): Promise<void> {
  await new Function("path", "return import(path)")("../tui/main.js");
}

function printHelp(): void {
  console.log(`qwen-proxy v${packageJson.version}`);
  console.log("");
  console.log("Usage: qwen-proxy <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  serve [--headless] [--host <host>] [--port <port>] Start proxy server or TUI");
  console.log("  auth [list|add <id>|remove <id>|counts]            Manage auth accounts");
  console.log("  usage                                               Show usage report");
  console.log("  tokens                                              Alias for usage");
  console.log("  help                                                Show this help");
  console.log("  version                                             Show CLI version");
}

function printServeHelp(): void {
  console.log("Usage: qwen-proxy serve [--headless] [--host <host>] [--port <port>]");
  console.log("");
  console.log("Options:");
  console.log("  --headless     Start the classic headless server instead of the TUI");
  console.log("  --host <host>  Override HOST env value for this run");
  console.log("  --port <port>  Override PORT env value for this run");
}

export function parseServeArgs(args: string[]): { help: boolean; headless: boolean; host?: string; port?: number | string; errors: string[] } {
  const parsed: { help: boolean; headless: boolean; host?: string; port?: number | string; errors: string[] } = {
    help: false,
    headless: false,
    host: undefined,
    port: undefined,
    errors: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--headless") {
      parsed.headless = true;
      continue;
    }

    if (arg === "--host") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        parsed.errors.push("Missing value for --host");
        continue;
      }
      parsed.host = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--host=")) {
      const value = arg.slice("--host=".length);
      if (!value) {
        parsed.errors.push("Missing value for --host");
        continue;
      }
      parsed.host = value;
      continue;
    }

    if (arg === "--port") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        parsed.errors.push("Missing value for --port");
        continue;
      }
      parsed.port = value;
      i += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      const value = arg.slice("--port=".length);
      if (!value) {
        parsed.errors.push("Missing value for --port");
        continue;
      }
      parsed.port = value;
      continue;
    }

    parsed.errors.push(`Unknown option for serve: ${arg}`);
  }

  if (parsed.port !== undefined) {
    if (!/^\d+$/.test(String(parsed.port))) {
      parsed.errors.push("Port must be a number between 1 and 65535");
    } else {
      const parsedPort = Number.parseInt(String(parsed.port), 10);
      if (parsedPort < 1 || parsedPort > 65535) {
        parsed.errors.push("Port must be a number between 1 and 65535");
      } else {
        parsed.port = parsedPort;
      }
    }
  }

  return parsed;
}

async function handleServeCommand(args: string[]): Promise<void> {
  const parsed = parseServeArgs(args);
  if (parsed.help) {
    printServeHelp();
    return;
  }

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.join("\n"));
  }

  if (!parsed.headless) {
    await startTui();
    return;
  }

  await startHeadlessServer({
    host: parsed.host,
    port: parsed.port,
  });
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.length === 0) {
    printHelp();
    return;
  }

  const [command, ...rest] = argv;
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log(packageJson.version);
    return;
  }

  if (command === "serve") {
    await handleServeCommand(rest);
    return;
  }

  if (command === "auth") {
    await runAuthCommand(rest, { commandPrefix: "qwen-proxy auth" });
    return;
  }

  if (command === "usage") {
    await runUsageCommand(rest, { commandName: "qwen-proxy usage" });
    return;
  }

  if (command === "tokens") {
    await runUsageCommand(rest, { commandName: "qwen-proxy tokens" });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (require.main === module) {
  void run().catch((error: any) => {
    console.error(error.message);
    process.exit(1);
  });
}
