export const RUNTIME_LOG_LEVELS = ["off", "error", "error-debug", "debug"] as const;

export type RuntimeLogLevel = (typeof RUNTIME_LOG_LEVELS)[number];

export type LiveLogGlyph = "request" | "response" | "error" | "refresh" | "server" | "auth" | "shutdown";

export interface LiveLogEvent {
  timestamp: string;
  glyph: LiveLogGlyph;
  message: string;
  accountId?: string;
  requestId?: string;
  statusCode?: number;
}

export interface ErrorLogEntry {
  timestamp: string;
  requestId: string;
  accountId: string;
  statusCode: number;
  errorMessage: string;
  response?: unknown;
  details?: unknown;
}

export interface RequestDebugArtifacts {
  requestId: string;
  clientRequest: unknown;
  upstreamRequest: unknown;
  response?: unknown;
  error?: unknown;
}

export interface LoggingServiceContract {
  getRuntimeLevel(): RuntimeLogLevel;
  setRuntimeLevel(level: RuntimeLogLevel): Promise<void>;
  emitLive(event: LiveLogEvent): void;
  writeError(entry: ErrorLogEntry): Promise<void>;
  writeRequestArtifacts(artifacts: RequestDebugArtifacts): Promise<void>;
}
