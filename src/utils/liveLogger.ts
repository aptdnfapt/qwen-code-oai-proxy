const winston: any = require("winston");

type ColorName = "red" | "green" | "blue" | "yellow" | "cyan" | "magenta" | "gray" | "white";

const colors: Record<ColorName, (text: string) => string> = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text) => `\x1b[35m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  white: (text) => `\x1b[37m${text}\x1b[0m`,
};

const accountColors = new Map<string, ColorName>();
const availableColors: ColorName[] = ["blue", "green", "yellow", "magenta", "cyan", "white"];
let colorIndex = 0;

function getAccountColor(accountId: string | null | undefined): ColorName {
  if (!accountId) {
    return "white";
  }

  const id = accountId.substring(0, 8);
  if (!accountColors.has(id)) {
    accountColors.set(id, availableColors[colorIndex % availableColors.length]);
    colorIndex += 1;
  }

  return accountColors.get(id) ?? "white";
}

function formatAccountTag(accountId: string | null | undefined): string {
  if (!accountId) {
    return colors.cyan("[default]");
  }

  const id = accountId.substring(0, 8);
  const color = getAccountColor(accountId);
  return colors[color](`[${id}]`);
}

const customFormat = winston.format.printf(({ timestamp, message }: { timestamp: string; message: string }) => {
  return `${timestamp} ${message}`;
});

const logger = winston.createLogger({
  level: "info",
  format: customFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp({ format: "HH:mm:ss" }), customFormat),
    }),
  ],
});

function log(message: string): void {
  logger.info(message);
}

function maskAccountId(accountId: string | null | undefined): string {
  if (!accountId) {
    return "none";
  }

  return accountId.length > 8 ? accountId.substring(0, 8) : accountId;
}

const liveLogger = {
  proxyRequest(requestId: string, model: string, accountId: string | null | undefined, tokenCount: number, requestNum?: number, isStreaming?: boolean): void {
    const reqNumStr = requestNum ? colors.gray(`#${requestNum}`) : "";
    const streamStr = isStreaming ? colors.cyan("{streaming}") : "";
    const message = `${colors.blue("→")} ${formatAccountTag(accountId)} ${colors.gray(requestId.substring(0, 8))} | ${colors.yellow(model)} ${streamStr} | ${colors.gray(`${tokenCount} tokens`)} ${reqNumStr}`;
    log(message);
  },

  proxyResponse(requestId: string, statusCode: number, accountId: string | null | undefined, latency: number, inputTokens: number, outputTokens: number, qwenId?: string | null): void {
    const statusColor = statusCode === 200 ? colors.green : colors.red;
    const tokenInfo = inputTokens && outputTokens ? ` | ${colors.cyan(`${inputTokens}+${outputTokens} tok`)}` : "";
    const shortId = requestId.length > 12 ? requestId.substring(0, 8) : requestId;
    const qwenInfo = qwenId ? ` | ${colors.magenta(`qwen: ${qwenId}`)}` : "";
    const message = `${colors.blue("←")} ${formatAccountTag(accountId)} ${colors.gray(shortId)} ${statusColor(String(statusCode))} | ${colors.gray(`${latency}ms`)}${tokenInfo}${qwenInfo}`;
    log(message);
  },

  proxyError(_requestId: string, statusCode: number, accountId: string | null | undefined, errorMessage: string): void {
    const message = `${colors.red("✗")} ${formatAccountTag(accountId)} ${colors.red(String(statusCode))} | ${colors.gray((errorMessage || "").substring(0, 50))}`;
    log(message);
  },

  authInitiated(deviceCode: string): void {
    log(`${colors.green("✓")} Auth | ${colors.gray(`code: ${deviceCode}`)}`);
  },

  authCompleted(accountId: string): void {
    log(`${colors.green("✓")} Auth done | ${colors.cyan(maskAccountId(accountId))}`);
  },

  accountRefreshed(accountId: string, status: string): void {
    const statusMessage = status === "healthy" ? colors.green("ok") : colors.red("fail");
    log(`${colors.blue("↻")} Refresh | ${colors.cyan(maskAccountId(accountId))} | ${statusMessage}`);
  },

  accountAdded(accountId: string): void {
    log(`${colors.green("+")} Account | ${colors.cyan(maskAccountId(accountId))}`);
  },

  accountRemoved(accountId: string): void {
    log(`${colors.red("-")} Account | ${colors.cyan(maskAccountId(accountId))}`);
  },

  serverStarted(host: string, port: number): void {
    log(`${colors.green("●")} Server | ${colors.cyan(`http://${host}:${port}`)}`);
  },

  shutdown(reason: string): void {
    log(`${colors.yellow("■")} Shutdown | ${colors.gray(reason)}`);
  },
};

export = liveLogger;
