function createShutdownHandler({ signal, qwenAPI, accountRefreshScheduler, liveLogger }) {
  return async () => {
    liveLogger.shutdown(`${signal} received`);
    try {
      accountRefreshScheduler.stopScheduler();
      liveLogger.accountRemoved('refresh-scheduler');
    } catch (error) {
      console.error('Failed to stop scheduler:', error.message);
    }

    try {
      await qwenAPI.saveRequestCounts();
    } catch (error) {
      console.error('Failed to save request counts:', error.message);
    }

    process.exit(0);
  };
}

function registerShutdownHandlers({ qwenAPI, accountRefreshScheduler, liveLogger }) {
  process.on('SIGINT', createShutdownHandler({ signal: 'SIGINT', qwenAPI, accountRefreshScheduler, liveLogger }));
  process.on('SIGTERM', createShutdownHandler({ signal: 'SIGTERM', qwenAPI, accountRefreshScheduler, liveLogger }));
}

async function initializeRuntimeConfig(runtimeConfigStore) {
  if (!runtimeConfigStore) {
    return;
  }

  try {
    await runtimeConfigStore.ensureStorage();
    await runtimeConfigStore.readConfig();
  } catch (error) {
    console.log(`\x1b[33mRuntime config init warning: ${error.message}\x1b[0m`);
  }
}

async function logAccountStatus({ qwenAPI, authService, config }) {
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
    console.log('\x1b[36mAccounts:\x1b[0m');
    for (const accountId of accountIds) {
      const credentials = authService
        ? authService.getAccountCredentials(accountId)
        : qwenAPI.authManager.getAccountCredentials(accountId);
      const isValid = authService
        ? authService.isTokenValid(credentials)
        : (credentials && qwenAPI.authManager.isTokenValid(credentials));
      const status = isValid ? '\x1b[32mvalid\x1b[0m' : '\x1b[31minvalid\x1b[0m';
      const isDefault = accountId === defaultAccount ? ' (default)' : '';
      console.log(`  ${accountId}${isDefault}: ${status}`);
    }
    return;
  }

  const defaultCredentials = authService
    ? await authService.loadDefaultCredentials()
    : await qwenAPI.authManager.loadCredentials();

  if (defaultCredentials) {
    const isValid = authService
      ? authService.isTokenValid(defaultCredentials)
      : qwenAPI.authManager.isTokenValid(defaultCredentials);
    const status = isValid ? '\x1b[32mvalid\x1b[0m' : '\x1b[31minvalid\x1b[0m';
    console.log(`\x1b[36mDefault account: ${status}\x1b[0m`);
  } else {
    console.log('\x1b[33mNo accounts configured\x1b[0m');
  }
}

async function initializeServerRuntime({
  host,
  port,
  qwenAPI,
  authService,
  runtimeConfigStore,
  accountRefreshScheduler,
  liveLogger,
  fileLogger,
  config,
}) {
  liveLogger.serverStarted(host, port);

  qwenAPI.authManager.init(qwenAPI);
  fileLogger.startCleanupJob();

  await initializeRuntimeConfig(runtimeConfigStore);

  try {
    await logAccountStatus({ qwenAPI, authService, config });
  } catch (_error) {
    console.log('\x1b[33mWarning: Could not load accounts\x1b[0m');
  }

  try {
    await accountRefreshScheduler.initialize();
  } catch (error) {
    console.log(`\x1b[31mScheduler init failed: ${error.message}\x1b[0m`);
  }
}

module.exports = {
  registerShutdownHandlers,
  initializeServerRuntime,
};
