import { RUNTIME_LOG_LEVELS, type RuntimeLogLevel } from "../core/types/logging";

function isRuntimeLogLevel(value: string): value is RuntimeLogLevel {
  return (RUNTIME_LOG_LEVELS as readonly string[]).includes(value);
}

export function createRuntimeLogLevelGetHandler({ fileLogger }: { fileLogger: any }) {
  return async (_req: any, res: any): Promise<void> => {
    try {
      const status = await fileLogger.getRuntimeStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({
        error: {
          message: error.message,
          type: "runtime_logging_error",
        },
      });
    }
  };
}

export function createRuntimeLogLevelPostHandler({ fileLogger }: { fileLogger: any }) {
  return async (req: any, res: any): Promise<void> => {
    const level = String(req.body?.level || "").toLowerCase();
    const rawPersist = req.body?.persist;
    const persist = rawPersist === undefined ? true : !(rawPersist === false || String(rawPersist).toLowerCase() === "false");

    if (!isRuntimeLogLevel(level)) {
      res.status(400).json({
        error: {
          message: `Invalid log level. Expected one of: ${RUNTIME_LOG_LEVELS.join(", ")}`,
          type: "invalid_request",
        },
      });
      return;
    }

    try {
      const status = await fileLogger.setRuntimeLogLevel(level, persist);
      res.json({
        ...status,
        persisted: persist,
      });
    } catch (error: any) {
      res.status(500).json({
        error: {
          message: error.message,
          type: "runtime_logging_error",
        },
      });
    }
  };
}
