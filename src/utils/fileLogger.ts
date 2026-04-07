const fs = require("node:fs") as typeof import("node:fs");

import { runtimeLoggingService, type LoggingStateSnapshot } from "./runtimeLoggingService";

type HeadersLike = Record<string, unknown> | null | undefined;
type RequestLike = {
  path: string;
  method: string;
  headers: Record<string, unknown>;
  body: any;
};

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

function getErrorResponseData(errorOrMessage: any, responseData: unknown, loggingState?: LoggingStateSnapshot): unknown {
  if (responseData !== undefined) {
    return responseData;
  }

  const effectiveState = loggingState ?? runtimeLoggingService.captureState();
  if (!effectiveState.isErrorDebugLogging || !errorOrMessage || typeof errorOrMessage !== "object") {
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

function getErrorDebugDetails(errorOrMessage: any, statusCode: number, loggingState?: LoggingStateSnapshot): Record<string, unknown> | null {
  const effectiveState = loggingState ?? runtimeLoggingService.captureState();
  if (!effectiveState.isErrorDebugLogging || !errorOrMessage || typeof errorOrMessage !== "object") {
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

function logError(requestId: string, accountId: string | null | undefined, statusCode: number, errorOrMessage: any, responseData?: unknown, loggingState?: LoggingStateSnapshot): void {
  const timestamp = new Date().toISOString();
  const id = accountId ? accountId.substring(0, 8) : "default";
  const errorMessage = getErrorMessage(errorOrMessage);
  const resolvedResponseData = getErrorResponseData(errorOrMessage, responseData, loggingState);
  const errorDebugDetails = getErrorDebugDetails(errorOrMessage, statusCode, loggingState);

   runtimeLoggingService.writeRequestErrorArtifact(requestId, {
    status: statusCode,
    error: errorMessage,
    timestamp,
    response: resolvedResponseData,
    details: errorDebugDetails,
  }, statusCode, loggingState);

  let logEntry = `[${timestamp}] STATUS=${statusCode} ACCOUNT=${id} REQUEST_ID=${requestId}\n`;
  logEntry += `Error: ${errorMessage}\n`;
  if (resolvedResponseData !== undefined) {
    logEntry += `Response:\n${formatRawResponseBody(resolvedResponseData)}\n`;
  }
  if (errorDebugDetails) {
    logEntry += `Details: ${formatLogValue(errorDebugDetails)}\n`;
  }
  logEntry += `${"=".repeat(80)}\n\n`;

  runtimeLoggingService.writeErrorEntry(logEntry, loggingState);
}

function logToFile(requestId: string, content: string, statusCode: number, loggingState?: LoggingStateSnapshot): void {
  runtimeLoggingService.writeRequestLogContent(requestId, content, statusCode, loggingState);
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

  if (transformedBody !== undefined) {
    logContent += "--------------------------\n";
    logContent += "TRANSFORMER\n";
    logContent += "Transformed Body:\n";
    logContent += `${JSON.stringify(transformedBody, null, 2)}\n`;
  }

  if (output !== undefined) {
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
  }

  return logContent;
}

const fileLogger = {
  logToFile,
  formatLogContent,
  logError,
  maskSensitiveHeaders,
  captureState(): LoggingStateSnapshot {
    return runtimeLoggingService.captureState();
  },
  async initialize(runtimeConfigStore?: any): Promise<any> {
    return runtimeLoggingService.initialize(runtimeConfigStore);
  },
  async getRuntimeStatus(): Promise<any> {
    return runtimeLoggingService.getRuntimeStatus();
  },
  async setRuntimeLogLevel(level: any, persist?: boolean): Promise<any> {
    return runtimeLoggingService.setRuntimeLogLevel(level, persist);
  },
  setConsoleEnabled(enabled: boolean): void {
    runtimeLoggingService.setConsoleEnabled(enabled);
  },
  get isErrorLogging(): boolean {
    return runtimeLoggingService.captureState().isErrorLogging;
  },
  get isErrorDebugLogging(): boolean {
    return runtimeLoggingService.captureState().isErrorDebugLogging;
  },
  get isDebugLogging(): boolean {
    return runtimeLoggingService.captureState().isDebugLogging;
  },
  get LOG_DIR(): string {
    return runtimeLoggingService.getLogDir();
  },
  startCleanupJob(): void {
    runtimeLoggingService.startCleanupJob();
  },
};

export = fileLogger;
