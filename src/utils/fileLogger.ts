const fs = require("node:fs") as typeof import("node:fs");
const fsPromises = fs.promises;
const path = require("node:path") as typeof import("node:path");

type HeadersLike = Record<string, unknown> | null | undefined;
type RequestLike = {
  path: string;
  method: string;
  headers: Record<string, unknown>;
  body: any;
};

const LEGACY_DEBUG_LOG = String(process.env.DEBUG_LOG || "").toLowerCase() === "true";
const resolvedLogLevel = process.env.LOG_LEVEL || (LEGACY_DEBUG_LOG ? "debug" : "error-debug");
const LOG_LEVEL = String(resolvedLogLevel).toLowerCase();
const validLevels = ["off", "error", "error-debug", "debug"];
const logLevel = validLevels.includes(LOG_LEVEL) ? LOG_LEVEL : "off";

const isErrorLogging = logLevel === "error" || logLevel === "error-debug" || logLevel === "debug";
const isErrorDebugLogging = logLevel === "error-debug" || logLevel === "debug";
const isDebugLogging = logLevel === "debug";

const ERROR_LOG_MAX_MB = Number.parseInt(process.env.ERROR_LOG_MAX_MB || "10", 10);
const ERROR_LOG_MAX_DAYS = Number.parseInt(process.env.ERROR_LOG_MAX_DAYS || "30", 10);
const MAX_DEBUG_LOGS = Number.parseInt(process.env.MAX_DEBUG_LOGS || process.env.LOG_FILE_LIMIT || "20", 10);

const LOG_DIR = path.join(process.cwd(), "log");
if ((isErrorLogging || isDebugLogging) && !fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function maskSensitiveHeaders(headers: HeadersLike): Record<string, unknown> {
  if (!headers) {
    return {};
  }

  const sensitiveHeaders = ["authorization", "x-api-key", "api-key", "cookie"];
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase()) && value) {
      if (String(value).startsWith("Bearer ")) {
        const token = String(value).substring(7);
        masked[key] = `Bearer ${token.substring(0, 10)}...${token.substring(token.length - 4)}`;
      } else {
        const valueString = String(value);
        masked[key] = valueString.length > 14 ? `${valueString.substring(0, 10)}...${valueString.substring(valueString.length - 4)}` : valueString;
      }
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

function formatLogValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatRawResponseBody(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getErrorMessage(errorOrMessage: any): string {
  if (errorOrMessage instanceof Error) {
    return errorOrMessage.message;
  }

  if (errorOrMessage && typeof errorOrMessage === "object" && typeof errorOrMessage.message === "string") {
    return errorOrMessage.message;
  }

  return String(errorOrMessage);
}

function getErrorResponseData(errorOrMessage: any, responseData: unknown): unknown {
  if (responseData !== undefined) {
    return responseData;
  }

  if (!isErrorDebugLogging || !errorOrMessage || typeof errorOrMessage !== "object") {
    return undefined;
  }

  if (errorOrMessage.upstreamErrorDetails && Object.prototype.hasOwnProperty.call(errorOrMessage.upstreamErrorDetails, "rawBody")) {
    return errorOrMessage.upstreamErrorDetails.rawBody;
  }

  const upstreamResponseData = errorOrMessage.response && errorOrMessage.response.data;
  if (upstreamResponseData && typeof upstreamResponseData.pipe === "function") {
    return "[stream response body captured separately]";
  }

  return upstreamResponseData;
}

function getErrorDebugDetails(errorOrMessage: any, statusCode: number): Record<string, unknown> | null {
  if (!isErrorDebugLogging || !errorOrMessage || typeof errorOrMessage !== "object") {
    return null;
  }

  const details: Record<string, unknown> = {
    status: statusCode,
  };

  if (errorOrMessage.code) {
    details.code = errorOrMessage.code;
  }

  if (errorOrMessage.response && errorOrMessage.response.statusText) {
    details.statusText = errorOrMessage.response.statusText;
  }

  if (errorOrMessage.upstreamErrorDetails) {
    details.upstream = {
      status: errorOrMessage.upstreamErrorDetails.status,
      statusText: errorOrMessage.upstreamErrorDetails.statusText,
    };
  } else if (errorOrMessage.response) {
    details.upstream = {
      status: errorOrMessage.response.status,
      statusText: errorOrMessage.response.statusText,
    };
  }

  if (errorOrMessage.stack) {
    details.stack = errorOrMessage.stack;
  }

  return Object.keys(details).length > 1 ? details : null;
}

function logError(requestId: string, accountId: string | null | undefined, statusCode: number, errorOrMessage: any, responseData?: unknown): void {
  if (!isErrorLogging) {
    return;
  }

  const errorLogPath = path.join(LOG_DIR, "error.log");
  const timestamp = new Date().toISOString();
  const id = accountId ? accountId.substring(0, 8) : "default";
  const errorMessage = getErrorMessage(errorOrMessage);
  const resolvedResponseData = getErrorResponseData(errorOrMessage, responseData);
  const errorDebugDetails = getErrorDebugDetails(errorOrMessage, statusCode);

  let logEntry = `[${timestamp}] STATUS=${statusCode} ACCOUNT=${id} REQUEST_ID=${requestId}\n`;
  logEntry += `Error: ${errorMessage}\n`;
  if (resolvedResponseData !== undefined) {
    logEntry += `Response:\n${formatRawResponseBody(resolvedResponseData)}\n`;
  }
  if (errorDebugDetails) {
    logEntry += `Details: ${formatLogValue(errorDebugDetails)}\n`;
  }
  logEntry += `${"=".repeat(80)}\n\n`;

  fs.appendFile(errorLogPath, logEntry, (error: NodeJS.ErrnoException | null) => {
    if (error) {
      console.error("Failed to write error log:", error.message);
    }
  });
}

function logToFile(requestId: string, content: string, statusCode: number): void {
  if (!isDebugLogging && !(isErrorDebugLogging && statusCode !== 200)) {
    return;
  }

  const requestDir = path.join(LOG_DIR, `req-${requestId}`);
  fsPromises.mkdir(requestDir, { recursive: true }).then(() => {
    const sections = content.split("--------------------------\n");

    for (const section of sections) {
      if (!section.trim() || section.startsWith("requestId:")) {
        continue;
      }

      const [title, ...rest] = section.trim().split("\n");
      const data = rest.join("\n").trim();

      if (!data) {
        continue;
      }

      let filename: string | null = null;
      if (title === "INPUT") {
        filename = "client-request.json";
      } else if (title === "TRANSFORMER") {
        filename = "upstream-request.json";
      } else if (title === "OUTPUT") {
        filename = "response.json";
      }

      if (!filename) {
        continue;
      }

      const filePath = path.join(requestDir, filename);
      void fsPromises.writeFile(filePath, data).catch(() => {});
    }
  }).catch(() => {});
}

function formatLogContent(requestId: string, req: RequestLike, transformedBody: unknown, statusCode: number, latency: number, output: unknown): string {
  let logContent = `requestId: ${requestId}\n`;
  logContent += `route: ${req.path}\n`;
  logContent += `method: ${req.method}\n`;
  logContent += `stream: ${req.body.stream === true}\n\n`;

  logContent += "--------------------------\n";
  logContent += "INPUT\n";
  logContent += "Client Headers:\n";
  logContent += `${JSON.stringify(maskSensitiveHeaders(req.headers), null, 2)}\n\n`;
  logContent += "Client Request Body:\n";
  logContent += `${JSON.stringify(req.body, null, 2)}\n`;

  logContent += "--------------------------\n";
  logContent += "TRANSFORMER\n";
  logContent += "Transformed Body:\n";
  logContent += `${JSON.stringify(transformedBody, null, 2)}\n`;

  logContent += "--------------------------\n";
  logContent += "OUTPUT\n";
  logContent += `status: ${statusCode}\n`;
  logContent += `latencyMs: ${latency}\n`;
  logContent += "Response Data:\n";
  if (typeof output === "string") {
    logContent += `${output}\n`;
  } else {
    logContent += `${JSON.stringify(output, null, 2)}\n`;
  }

  return logContent;
}

async function rotateErrorLog(): Promise<void> {
  const errorLogPath = path.join(LOG_DIR, "error.log");

  try {
    const stats = await fsPromises.stat(errorLogPath);
    const sizeMb = stats.size / (1024 * 1024);

    if (sizeMb >= ERROR_LOG_MAX_MB) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const rotatedPath = path.join(LOG_DIR, `error-${timestamp}.log`);
      await fsPromises.rename(errorLogPath, rotatedPath);
      console.log(`[LOG] Rotated error.log to error-${timestamp}.log`);
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.error("[LOG] Failed to rotate error.log:", error.message);
    }
  }
}

async function cleanupOldErrorLogs(): Promise<void> {
  try {
    const files = await fsPromises.readdir(LOG_DIR);
    const errorLogs = files.filter((file) => file.startsWith("error-") && file.endsWith(".log"));
    const now = Date.now();
    const maxAge = ERROR_LOG_MAX_DAYS * 24 * 60 * 60 * 1000;

    for (const file of errorLogs) {
      const filePath = path.join(LOG_DIR, file);
      const stats = await fsPromises.stat(filePath);
      const age = now - stats.mtime.getTime();
      if (age > maxAge) {
        await fsPromises.unlink(filePath);
        console.log(`[LOG] Deleted old error log: ${file}`);
      }
    }
  } catch (error: any) {
    console.error("[LOG] Failed to cleanup old error logs:", error.message);
  }
}

async function cleanupOldDebugLogs(): Promise<void> {
  try {
    const entries = await fsPromises.readdir(LOG_DIR, { withFileTypes: true });
    const debugDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("req-"));

    if (debugDirs.length <= MAX_DEBUG_LOGS) {
      return;
    }

    const dirStats: Array<{ name: string; path: string; mtime: Date }> = [];
    for (const dir of debugDirs) {
      const dirPath = path.join(LOG_DIR, dir.name);
      const stats = await fsPromises.stat(dirPath);
      dirStats.push({ name: dir.name, path: dirPath, mtime: stats.mtime });
    }

    dirStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const dirsToDelete = dirStats.slice(MAX_DEBUG_LOGS);
    for (const dir of dirsToDelete) {
      await fsPromises.rm(dir.path, { recursive: true });
      console.log(`[LOG] Deleted old debug log directory: ${dir.name}`);
    }
  } catch (error: any) {
    console.error("[LOG] Failed to cleanup old debug logs:", error.message);
  }
}

async function cleanupOldFormatLogs(): Promise<void> {
  try {
    const files = await fsPromises.readdir(LOG_DIR);
    const oldFormatLogs = files.filter((file) => file.startsWith("req-") && file.endsWith(".log"));
    for (const file of oldFormatLogs) {
      const filePath = path.join(LOG_DIR, file);
      await fsPromises.unlink(filePath);
      console.log(`[LOG] Deleted old format log file: ${file}`);
    }
  } catch (error: any) {
    console.error("[LOG] Failed to cleanup old format logs:", error.message);
  }
}

async function cleanupLogs(): Promise<void> {
  await rotateErrorLog();
  await cleanupOldErrorLogs();
  await cleanupOldFormatLogs();
  await cleanupOldDebugLogs();
}

function startCleanupJob(): void {
  if (logLevel === "off") {
    return;
  }

  const debugModeDescription = isDebugLogging ? "full" : (isErrorDebugLogging ? "non-200 only" : "off");
  console.log(`[LOG] Logging mode=${logLevel}, debug=${debugModeDescription} - error.log: ${ERROR_LOG_MAX_MB}MB, error logs: ${ERROR_LOG_MAX_DAYS} days, request logs: last ${MAX_DEBUG_LOGS} files`);

  setInterval(() => {
    void cleanupLogs().catch((error: any) => console.error("[LOG] Cleanup job error:", error.message));
  }, 3600000);

  setTimeout(() => {
    void cleanupLogs();
  }, 5000);
}

const fileLogger = {
  logToFile,
  formatLogContent,
  logError,
  isErrorLogging,
  isErrorDebugLogging,
  isDebugLogging,
  LOG_DIR,
  maskSensitiveHeaders,
  startCleanupJob,
};

export = fileLogger;
