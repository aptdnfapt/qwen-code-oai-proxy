const fs = require("node:fs").promises as typeof import("node:fs").promises;
const path = require("node:path") as typeof import("node:path");
const config = require("../config.js") as any;

const debugDir = path.join(__dirname, "..", "..", "debug");

export class DebugLogger {
  constructor() {
    void this.ensureDebugDir();
  }

  async ensureDebugDir(): Promise<void> {
    try {
      await fs.access(debugDir);
    } catch {
      await fs.mkdir(debugDir, { recursive: true });
    }
  }

  async enforceLogFileLimit(limit: number): Promise<void> {
    try {
      const files = await fs.readdir(debugDir);
      const debugFiles = files.filter((file) => file.startsWith("debug-") && file.endsWith(".txt"));

      if (debugFiles.length > limit) {
        const fileStats = await Promise.all(debugFiles.map(async (file) => {
          const filePath = path.join(debugDir, file);
          const stats = await fs.stat(filePath);
          return { file, mtime: stats.mtime };
        }));

        fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
        const filesToRemove = fileStats.length - limit;
        for (let i = 0; i < filesToRemove; i += 1) {
          const filePath = path.join(debugDir, fileStats[i].file);
          await fs.unlink(filePath);
        }
      }
    } catch {
    }
  }

  getTimestampForFilename(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}-${hours}:${minutes}:${seconds}`;
  }

  getTimestampForLog(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const milliseconds = String(now.getMilliseconds()).padStart(3, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  }

  async logApiCall(endpoint: string, request: any, response: any, error: any = null): Promise<string | null> {
    if (!config.debugLog) {
      return null;
    }

    try {
      const timestamp = this.getTimestampForFilename();
      const logFilePath = path.join(debugDir, `debug-${timestamp}.txt`);
      const debugFileName = `debug-${timestamp}.txt`;
      const logRequest = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
        query: request.query,
      };

      let detailedError: any = null;
      if (error) {
        detailedError = {
          name: error.name,
          message: error.message,
          stack: error.stack,
          type: this.getErrorType(error),
          statusCode: this.getErrorStatusCode(error),
          timestamp: this.getTimestampForLog(),
        };

        if (error.response?.status) {
          detailedError.apiStatus = error.response.status;
          detailedError.apiData = error.response.data;
        }

        if (error.code) detailedError.code = error.code;
        if (error.errno) detailedError.errno = error.errno;
        if (error.syscall) detailedError.syscall = error.syscall;
      }

      const logEntry = {
        timestamp: this.getTimestampForLog(),
        endpoint,
        request: this.sanitizeRequest(logRequest),
        response: error ? detailedError : response,
        isErrorResponse: Boolean(error),
      };

      const logContent = JSON.stringify(logEntry, (key, value) => {
        if (key === "stack" && typeof value === "string") {
          return value.split("\n").slice(0, 20).join("\n");
        }
        if (value instanceof Error) {
          return { name: value.name, message: value.message, stack: value.stack };
        }
        if (typeof value === "bigint") {
          return value.toString();
        }
        return value;
      }, 2);

      await fs.writeFile(logFilePath, logContent);
      await this.enforceLogFileLimit(config.logFileLimit);
      console.log("\x1b[32m%s\x1b[0m", `Debug log saved to: ${debugFileName}`);
      return debugFileName;
    } catch {
      return null;
    }
  }

  getErrorType(error: any): string {
    if (!error) return "unknown";
    if (error.message && (error.message.includes("validation") || error.message.toLowerCase().includes("invalid") || error.message.includes("Validation error"))) {
      return "validation_error";
    }
    if (error.message && (error.message.includes("Not authenticated") || error.message.includes("access token") || error.message.includes("authorization") || error.message.includes("401") || error.message.includes("403"))) {
      return "authentication_error";
    }
    if (error.message && (error.message.includes("429") || error.message.toLowerCase().includes("rate limit") || error.message.toLowerCase().includes("quota"))) {
      return "rate_limit_error";
    }
    if (error.code && (["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN"] as string[]).includes(error.code)) {
      return "network_error";
    }
    if (error.message && (error.message.toLowerCase().includes("timeout") || error.code === "TIMEOUT")) {
      return "timeout_error";
    }
    if (error.name === "SyntaxError" || error.name === "TypeError" || error.name === "ReferenceError") {
      return "javascript_error";
    }
    return "application_error";
  }

  getErrorStatusCode(error: any): number | null {
    if (error.response?.status) return error.response.status;
    if (error.status) return error.status;
    const match = error.message?.match(/status[^\d]*(\d{3})/i);
    if (match) return Number.parseInt(match[1], 10);
    return null;
  }

  async logError(context: string, error: any, level = "error"): Promise<string | null> {
    if (!config.debugLog) {
      return null;
    }

    try {
      const timestamp = this.getTimestampForFilename();
      const logFilePath = path.join(debugDir, `debug-${timestamp}.txt`);
      const debugFileName = `debug-${timestamp}.txt`;
      const detailedError: any = {
        context,
        level,
        name: error.name,
        message: error.message,
        stack: error.stack,
        type: this.getErrorType(error),
        timestamp: this.getTimestampForLog(),
      };

      if (error.code) detailedError.code = error.code;
      if (error.errno) detailedError.errno = error.errno;
      if (error.syscall) detailedError.syscall = error.syscall;
      if (error.path) detailedError.path = error.path;
      if (error.response) {
        detailedError.response = {
          status: error.response.status,
          statusText: error.response.statusText,
          headers: error.response.headers,
          data: error.response.data,
        };
      }

      await fs.writeFile(logFilePath, JSON.stringify(detailedError, null, 2));
      await this.enforceLogFileLimit(config.logFileLimit);
      console.log("\x1b[32m%s\x1b[0m", `Error log saved to: ${debugFileName}`);
      return debugFileName;
    } catch {
      return null;
    }
  }

  sanitizeRequest(request: any): any {
    if (!request) return request;
    const sanitized = JSON.parse(JSON.stringify(request));
    if (sanitized.headers) {
      if (sanitized.headers.Authorization) sanitized.headers.Authorization = "[REDACTED]";
      if (sanitized.headers.authorization) sanitized.headers.authorization = "[REDACTED]";
    }
    if (sanitized.body) {
      if (sanitized.body.access_token) sanitized.body.access_token = "[REDACTED]";
      if (sanitized.body.refresh_token) sanitized.body.refresh_token = "[REDACTED]";
    }
    return sanitized;
  }
}
