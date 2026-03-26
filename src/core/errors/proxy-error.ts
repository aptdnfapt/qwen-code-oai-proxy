export type ProxyErrorType =
  | "validation_error"
  | "authentication_error"
  | "authorization_error"
  | "upstream_error"
  | "quota_exceeded"
  | "not_found"
  | "internal_error";

export interface ProxyErrorInit {
  type: ProxyErrorType;
  message: string;
  statusCode: number;
  cause?: unknown;
  requestId?: string;
  details?: Record<string, unknown>;
}

export class ProxyError extends Error {
  readonly type: ProxyErrorType;
  readonly statusCode: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(init: ProxyErrorInit) {
    super(init.message);
    this.name = "ProxyError";
    this.type = init.type;
    this.statusCode = init.statusCode;
    this.requestId = init.requestId;
    this.details = init.details;
    this.cause = init.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      message: this.message,
      statusCode: this.statusCode,
      requestId: this.requestId,
      details: this.details,
    };
  }
}

export function toProxyError(error: unknown, fallbackStatusCode = 500): ProxyError {
  if (error instanceof ProxyError) {
    return error;
  }

  if (error instanceof Error) {
    return new ProxyError({
      type: "internal_error",
      message: error.message,
      statusCode: fallbackStatusCode,
      cause: error,
    });
  }

  return new ProxyError({
    type: "internal_error",
    message: String(error),
    statusCode: fallbackStatusCode,
    cause: error,
  });
}
