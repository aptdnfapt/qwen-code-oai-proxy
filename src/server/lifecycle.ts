async function stopSchedulerAndPersist({ qwenAPI, accountRefreshScheduler, liveLogger, reason }: { qwenAPI: any; accountRefreshScheduler: any; liveLogger: any; reason: string }): Promise<void> {
  liveLogger.shutdown(reason);

  try {
    accountRefreshScheduler.stopScheduler();
    liveLogger.accountRemoved("refresh-scheduler");
  } catch (error: any) {
    console.error("Failed to stop scheduler:", error.message);
  }

  try {
    await qwenAPI.saveRequestCounts();
  } catch (error: any) {
    console.error("Failed to save request counts:", error.message);
  }
}

export async function shutdownServerRuntime({
  qwenAPI,
  accountRefreshScheduler,
  liveLogger,
  server,
  reason,
}: {
  qwenAPI: any;
  accountRefreshScheduler: any;
  liveLogger: any;
  server?: any;
  reason: string;
}): Promise<void> {
  await stopSchedulerAndPersist({ qwenAPI, accountRefreshScheduler, liveLogger, reason });

  if (!server) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error: any) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createShutdownHandler({ signal, server, qwenAPI, accountRefreshScheduler, liveLogger }: { signal: string; server?: any; qwenAPI: any; accountRefreshScheduler: any; liveLogger: any }) {
  return async (): Promise<void> => {
    await shutdownServerRuntime({ server, qwenAPI, accountRefreshScheduler, liveLogger, reason: `${signal} received` });
    process.exit(0);
  };
}

export function registerShutdownHandlers({ server, qwenAPI, accountRefreshScheduler, liveLogger }: { server?: any; qwenAPI: any; accountRefreshScheduler: any; liveLogger: any }): void {
  process.on("SIGINT", createShutdownHandler({ signal: "SIGINT", server, qwenAPI, accountRefreshScheduler, liveLogger }));
  process.on("SIGTERM", createShutdownHandler({ signal: "SIGTERM", server, qwenAPI, accountRefreshScheduler, liveLogger }));
}

async function initializeRuntimeLogging(runtimeConfigStore: any, fileLogger: any): Promise<void> {
  if (!fileLogger) {
    return;
  }

  try {
    await fileLogger.initialize(runtimeConfigStore);
  } catch (error: any) {
    console.log(`\x1b[33mRuntime logging init warning: ${error.message}\x1b[0m`);
  }
}

async function logAccountStatus({ qwenAPI, authService, config }: { qwenAPI: any; authService: any; config: any }): Promise<void> {
  if (authService) {
    await authService.loadAccounts();
  } else {
    await qwenAPI.authManager.loadAllAccounts();
  }

  const accountIds = authService ? authService.listAccountIds() : qwenAPI.authManager.getAccountIds();
  const defaultAccount = config.defaultAccount;
  if (defaultAccount) {
    console.log(`\x1b[36mDefault account: ${defaultAccount}\x1b[0m`);
  }

  if (accountIds.length > 0) {
    console.log("\x1b[36mAccounts:\x1b[0m");
    for (const accountId of accountIds) {
      const credentials = authService ? authService.getAccountCredentials(accountId) : qwenAPI.authManager.getAccountCredentials(accountId);
      const isValid = authService ? authService.isTokenValid(credentials) : Boolean(credentials && qwenAPI.authManager.isTokenValid(credentials));
      const status = isValid ? "\x1b[32mvalid\x1b[0m" : "\x1b[31minvalid\x1b[0m";
      const isDefault = accountId === defaultAccount ? " (default)" : "";
      console.log(`  ${accountId}${isDefault}: ${status}`);
    }
    return;
  }

  const defaultCredentials = authService ? await authService.loadDefaultCredentials() : await qwenAPI.authManager.loadCredentials();
  if (defaultCredentials) {
    const isValid = authService ? authService.isTokenValid(defaultCredentials) : qwenAPI.authManager.isTokenValid(defaultCredentials);
    const status = isValid ? "\x1b[32mvalid\x1b[0m" : "\x1b[31minvalid\x1b[0m";
    console.log(`\x1b[36mDefault account: ${status}\x1b[0m`);
  } else {
    console.log("\x1b[33mNo accounts configured\x1b[0m");
  }
}

export async function initializeServerRuntime({
  host,
  port,
  qwenAPI,
  authService,
  runtimeConfigStore,
  accountRefreshScheduler,
  liveLogger,
  fileLogger,
  config,
}: {
  host: string;
  port: number;
  qwenAPI: any;
  authService: any;
  runtimeConfigStore: any;
  accountRefreshScheduler: any;
  liveLogger: any;
  fileLogger: any;
  config: any;
}): Promise<void> {
  await initializeRuntimeLogging(runtimeConfigStore, fileLogger);
  liveLogger.serverStarted(host, port);
  qwenAPI.authManager.init(qwenAPI);
  fileLogger.startCleanupJob();

  try {
    await logAccountStatus({ qwenAPI, authService, config });
  } catch {
    console.log("\x1b[33mWarning: Could not load accounts\x1b[0m");
  }

  try {
    await accountRefreshScheduler.initialize();
  } catch (error: any) {
    console.log(`\x1b[31mScheduler init failed: ${error.message}\x1b[0m`);
  }
}
