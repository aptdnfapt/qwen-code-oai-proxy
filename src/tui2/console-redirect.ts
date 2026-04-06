import { formatWithOptions } from "node:util";

const originalConsoleLog = console.log.bind(console);
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleInfo = console.info.bind(console);
const originalConsoleDebug = console.debug.bind(console);

type LogCallback = (level: "info" | "warn" | "error" | "debug", message: string) => void;

let isEnabled = false;
let logCallback: LogCallback | null = null;

const ANSI_RE = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "").replace(/[\r\x00-\x08\x0b-\x1f\x7f]/g, "").trim();
}

function forwardToCallback(level: "info" | "warn" | "error" | "debug", args: unknown[]): void {
  if (!isEnabled || !logCallback) {
    return;
  }

  const message = formatConsoleArgs(args);

  const cleaned = stripAnsi(message);
  if (cleaned) {
    logCallback(level, cleaned);
  }
}

function formatConsoleArgs(args: unknown[]): string {
  if (args.length === 0) {
    return "";
  }

  if (typeof args[0] === "string") {
    return formatWithOptions({ colors: false }, args[0], ...args.slice(1));
  }

  return args
    .map((arg) => (typeof arg === "object" ? safeStringify(arg) : String(arg)))
    .join(" ");
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

function interceptedConsoleLog(...args: unknown[]): void {
  forwardToCallback("info", args);
}

function interceptedConsoleError(...args: unknown[]): void {
  forwardToCallback("error", args);
}

function interceptedConsoleWarn(...args: unknown[]): void {
  forwardToCallback("warn", args);
}

function interceptedConsoleInfo(...args: unknown[]): void {
  forwardToCallback("info", args);
}

function interceptedConsoleDebug(...args: unknown[]): void {
  forwardToCallback("debug", args);
}

export function enableConsoleRedirect(callback: LogCallback): void {
  if (isEnabled) {
    return;
  }

  logCallback = callback;
  isEnabled = true;

  console.log = interceptedConsoleLog as typeof console.log;
  console.error = interceptedConsoleError as typeof console.error;
  console.warn = interceptedConsoleWarn as typeof console.warn;
  console.info = interceptedConsoleInfo as typeof console.info;
  console.debug = interceptedConsoleDebug as typeof console.debug;
}

export function disableConsoleRedirect(): void {
  if (!isEnabled) {
    return;
  }

  isEnabled = false;
  logCallback = null;

  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.info = originalConsoleInfo;
  console.debug = originalConsoleDebug;
}
