import type { ErrorLogEntry, LiveLogEvent, RequestDebugArtifacts, RuntimeLogLevel } from "../types/logging";

export interface RuntimeLogLevelStore {
  getLogLevel(): Promise<RuntimeLogLevel>;
  setLogLevel(level: RuntimeLogLevel): Promise<void>;
}

export interface LiveLoggerContract {
  emit(event: LiveLogEvent): void;
}

export interface ErrorLogWriterContract {
  write(entry: ErrorLogEntry): Promise<void>;
}

export interface RequestLogWriterContract {
  write(artifacts: RequestDebugArtifacts): Promise<void>;
}

export interface LoggingServiceContract {
  getRuntimeLevel(): Promise<RuntimeLogLevel>;
  setRuntimeLevel(level: RuntimeLogLevel): Promise<void>;
  emitLive(event: LiveLogEvent): void;
  writeError(entry: ErrorLogEntry): Promise<void>;
  writeRequestArtifacts(artifacts: RequestDebugArtifacts): Promise<void>;
}
