class AccountRefreshScheduler {
  constructor(qwenAPI) {
    this.qwenAPI = qwenAPI;
    this.refreshInterval = null;
    this.isRefreshing = false;
  }

  /**
   * Initialize the account refresh scheduler
   */
  async initialize() {
    console.log('\x1b[36m%s\x1b[0m', 'Initializing account refresh scheduler...');
    
    // Start the refresh scheduler
    await this.startScheduler();
  }

  async startScheduler() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    await this.checkAndRefreshExpiredAccounts();

    this.refreshInterval = setInterval(() => {
      this.checkAndRefreshExpiredAccounts();
    }, 5 * 60 * 1000);
  }

  stopScheduler() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Check for expired accounts and refresh their tokens using account locks to prevent conflicts
   * Processes accounts in parallel batches with concurrency control
   */
  async checkAndRefreshExpiredAccounts() {
    // Check if a refresh process is already running
    if (this.isRefreshing) {
    //   console.log('\x1b[33m%s\x1b[0m', 'Account refresh is already in progress, skipping this check');
      return;
    }

    // Set the flag to indicate a refresh process is starting
    this.isRefreshing = true;

    try {

      // Load all accounts (in case new ones were added)
      await this.qwenAPI.authManager.loadAllAccounts();

      const accountIds = this.qwenAPI.authManager.getAccountIds();
      const defaultCredentials = await this.qwenAPI.authManager.loadCredentials();
      const refreshTargets = [];

      if (defaultCredentials) {
        refreshTargets.push({
          accountId: 'default',
          credentials: defaultCredentials,
          isDefault: true,
        });
      }

      for (const accountId of accountIds) {
        refreshTargets.push({
          accountId,
          credentials: this.qwenAPI.authManager.getAccountCredentials(accountId),
          isDefault: false,
        });
      }

      const accountsToRefresh = [];

      for (const target of refreshTargets) {
        const { accountId, credentials, isDefault } = target;

        if (!credentials) {
          continue;
        }

        const isExpired = credentials.expiry_date <= Date.now();
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
        const refreshAccountId = isDefault ? null : accountId;

        if (this.qwenAPI.authManager.shouldRefreshToken(credentials, refreshAccountId)) {
          accountsToRefresh.push(target);

          if (isExpired) {
            console.log(`\x1b[31m●\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[31mexpired\x1b[0m`);
          } else {
            const thresholdMinutes = this.qwenAPI.authManager.getRefreshThresholdMinutes(refreshAccountId);
            console.log(`\x1b[35m●\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[35mexpiring\x1b[0m | ${minutesLeft.toFixed(0)}m <= ${thresholdMinutes}m`);
          }
        }
      }

      if (accountsToRefresh.length === 0) {
        console.log(`\x1b[32m●\x1b[0m Refresh | \x1b[32midle\x1b[0m | ${refreshTargets.length} accounts`);
        return;
      }

      // Process accounts that need refresh in parallel batches of 20
      const batchSize = 20;
      for (let i = 0; i < accountsToRefresh.length; i += batchSize) {
        const batch = accountsToRefresh.slice(i, i + batchSize);

        // Process the current batch in parallel
        const batchPromises = batch.map(async (target) => {
          const { accountId, isDefault } = target;
          const credentials = isDefault
            ? await this.qwenAPI.authManager.loadCredentials()
            : this.qwenAPI.authManager.getAccountCredentials(accountId);

          if (!credentials) {
            console.log(`\x1b[31m%s\x1b[0m`, `No credentials found for account ${accountId}`);
            return;
          }

          try {
            await this.qwenAPI.authManager.refreshCredentialsIfNeeded(
              credentials,
              isDefault ? null : accountId
            );
            console.log(`\x1b[32m●\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[32mrefreshed\x1b[0m`);
          } catch (refreshError) {
            console.warn(`\x1b[31m✗\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[31mfailed\x1b[0m: ${refreshError.message.substring(0, 30)}`);
          }

        });

        await Promise.allSettled(batchPromises);
      }
    } catch (error) {
      console.warn(`\x1b[31m!\x1b[0m Refresh | \x1b[31merror\x1b[0m: ${error.message.substring(0, 30)}`);
    } finally {
      // Reset the flag to indicate the refresh process is complete
      this.isRefreshing = false;
    }
  }

  async forceRefreshAllAccounts() {
    await this.qwenAPI.authManager.loadAllAccounts();
    const accountIds = this.qwenAPI.authManager.getAccountIds();
    const defaultCredentials = await this.qwenAPI.authManager.loadCredentials();
    const refreshTargets = [];

    if (defaultCredentials) {
      refreshTargets.push({
        accountId: 'default',
        credentials: defaultCredentials,
        isDefault: true,
      });
    }

    for (const accountId of accountIds) {
      refreshTargets.push({
        accountId,
        credentials: this.qwenAPI.authManager.getAccountCredentials(accountId),
        isDefault: false,
      });
    }

    if (refreshTargets.length === 0) {
      console.log(`\x1b[33m○\x1b[0m Refresh | \x1b[33mnone\x1b[0m | no accounts`);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const target of refreshTargets) {
      const { accountId, isDefault } = target;
      const credentials = isDefault
        ? await this.qwenAPI.authManager.loadCredentials()
        : this.qwenAPI.authManager.getAccountCredentials(accountId);

      if (!credentials) {
        failCount++;
        continue;
      }

      try {
        await this.qwenAPI.authManager.refreshCredentialsIfNeeded(
          credentials,
          isDefault ? null : accountId,
          { force: true }
        );
        console.log(`\x1b[32m●\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[32mforced\x1b[0m`);
        successCount++;
      } catch (refreshError) {
        console.warn(`\x1b[31m✗\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[31mfailed\x1b[0m: ${refreshError.message.substring(0, 30)}`);
        failCount++;
      }
    }

    console.log(`\x1b[36m●\x1b[0m Refresh | \x1b[36mforced\x1b[0m | ${successCount} ok, ${failCount} fail`);
  }
}

module.exports = { AccountRefreshScheduler };
