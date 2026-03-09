const winston = require('winston');

const colors = {
  red: (t) => `\x1b[31m${t}\x1b[0m`,
  green: (t) => `\x1b[32m${t}\x1b[0m`,
  blue: (t) => `\x1b[34m${t}\x1b[0m`,
  yellow: (t) => `\x1b[33m${t}\x1b[0m`,
  cyan: (t) => `\x1b[36m${t}\x1b[0m`,
  magenta: (t) => `\x1b[35m${t}\x1b[0m`,
  gray: (t) => `\x1b[90m${t}\x1b[0m`,
  white: (t) => `\x1b[37m${t}\x1b[0m`
};

const accountColors = new Map();
const availableColors = ['blue', 'green', 'yellow', 'magenta', 'cyan', 'white'];
let colorIndex = 0;

function getAccountColor(accountId) {
  if (!accountId) return 'white';
  const id = accountId.substring(0, 8);
  if (!accountColors.has(id)) {
    accountColors.set(id, availableColors[colorIndex % availableColors.length]);
    colorIndex++;
  }
  return accountColors.get(id);
}

function formatAccountTag(accountId) {
  if (!accountId) return colors.cyan('[default]');
  const id = accountId.substring(0, 8);
  const color = getAccountColor(accountId);
  return colors[color](`[${id}]`);
}

const customFormat = winston.format.printf(({ timestamp, level, message }) => {
  return `${timestamp} ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: customFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        customFormat
      )
    })
  ]
});

function log(message) {
  logger.info(message);
}

function maskApiKey(key) {
  const s = String(key || '');
  return s.length > 13 ? s.substring(0, 13) + '...' : s;
}

function maskAccountId(accountId) {
  if (!accountId) return 'none';
  return accountId.length > 8 ? accountId.substring(0, 8) : accountId;
}

const liveLogger = {
  proxyRequest(requestId, model, accountId, tokenCount, requestNum, isStreaming) {
    const reqNumStr = requestNum ? colors.gray(`#${requestNum}`) : '';
    const streamStr = isStreaming ? colors.cyan('{streaming}') : '';
    const msg = `${colors.blue('→')} ${formatAccountTag(accountId)} ${colors.gray(requestId.substring(0, 8))} | ${colors.yellow(model)} ${streamStr} | ${colors.gray(`${tokenCount} tokens`)} ${reqNumStr}`;
    log(msg);
  },

  proxyResponse(requestId, statusCode, accountId, latency, inputTokens, outputTokens, qwenId) {
    const statusColor = statusCode === 200 ? colors.green : colors.red;
    const tokenInfo = inputTokens && outputTokens 
      ? ` | ${colors.cyan(`${inputTokens}+${outputTokens} tok`)}`
      : '';
    const shortId = requestId.length > 12 ? requestId.substring(0, 8) : requestId;
    const qwenInfo = qwenId ? ` | ${colors.magenta(`qwen: ${qwenId}`)}` : '';
    const msg = `${colors.blue('←')} ${formatAccountTag(accountId)} ${colors.gray(shortId)} ${statusColor(statusCode)} | ${colors.gray(`${latency}ms`)}${tokenInfo}${qwenInfo}`;
    log(msg);
  },

  proxyError(requestId, statusCode, accountId, errorMessage) {
    const msg = `${colors.red('✗')} ${formatAccountTag(accountId)} ${colors.red(statusCode)} | ${colors.gray(errorMessage.substring(0, 50))}`;
    log(msg);
  },

  authInitiated(deviceCode) {
    const msg = `${colors.green('✓')} Auth | ${colors.gray(`code: ${deviceCode}`)}`;
    log(msg);
  },

  authCompleted(accountId) {
    const msg = `${colors.green('✓')} Auth done | ${colors.cyan(maskAccountId(accountId))}`;
    log(msg);
  },

  accountRefreshed(accountId, status) {
    const statusMsg = status === 'healthy' ? colors.green('ok') : colors.red('fail');
    const msg = `${colors.blue('↻')} Refresh | ${colors.cyan(maskAccountId(accountId))} | ${statusMsg}`;
    log(msg);
  },

  accountAdded(accountId) {
    const msg = `${colors.green('+')} Account | ${colors.cyan(maskAccountId(accountId))}`;
    log(msg);
  },

  accountRemoved(accountId) {
    const msg = `${colors.red('-')} Account | ${colors.cyan(maskAccountId(accountId))}`;
    log(msg);
  },

  serverStarted(host, port) {
    const msg = `${colors.green('●')} Server | ${colors.cyan(`http://${host}:${port}`)}`;
    log(msg);
  },

  shutdown(reason) {
    const msg = `${colors.yellow('■')} Shutdown | ${colors.gray(reason)}`;
    log(msg);
  }
};

module.exports = liveLogger;