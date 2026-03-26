export class AccountRefreshScheduler {
  qwenAPI: any;
  refreshInterval: NodeJS.Timeout | null;
  isRefreshing: boolean;

  constructor(qwenAPI: any) {
    this.qwenAPI = qwenAPI;
    this.refreshInterval = null;
    this.isRefreshing = false;
  }

  async initialize(): Promise<void> {
    console.log("\x1b[36m%s\x1b[0m", "Initializing account refresh scheduler...");
    await this.startScheduler();
  }

  async startScheduler(): Promise<void> {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    await this.checkAndRefreshExpiredAccounts();
    this.refreshInterval = setInterval(() => {
      void this.checkAndRefreshExpiredAccounts();
    }, 5 * 60 * 1000);
  }

  stopScheduler(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async checkAndRefreshExpiredAccounts(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;

    try {
      await this.qwenAPI.authManager.loadAllAccounts();
      const accountIds = this.qwenAPI.authManager.getAccountIds();
      const defaultCredentials = await this.qwenAPI.authManager.loadCredentials();
      const refreshTargets: any[] = [];

      if (defaultCredentials) {
        refreshTargets.push({ accountId: "default", credentials: defaultCredentials, isDefault: true });
      }

      for (const accountId of accountIds) {
        refreshTargets.push({
          accountId,
          credentials: this.qwenAPI.authManager.getAccountCredentials(accountId),
          isDefault: false,
        });
      }

      const accountsToRefresh: any[] = [];
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

      const batchSize = 20;
      for (let i = 0; i < accountsToRefresh.length; i += batchSize) {
        const batch = accountsToRefresh.slice(i, i + batchSize);
        const batchPromises = batch.map(async (target) => {
          const { accountId, isDefault } = target;
          const credentials = isDefault
            ? await this.qwenAPI.authManager.loadCredentials()
            : this.qwenAPI.authManager.getAccountCredentials(accountId);

          if (!credentials) {
            console.log("\x1b[31m%s\x1b[0m", `No credentials found for account ${accountId}`);
            return;
          }

          try {
            await this.qwenAPI.authManager.refreshCredentialsIfNeeded(credentials, isDefault ? null : accountId);
            console.log(`\x1b[32m●\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[32mrefreshed\x1b[0m`);
          } catch (refreshError: any) {
            console.warn(`\x1b[31m✗\x1b[0m Refresh | \x1b[36m${accountId}\x1b[0m | \x1b[31mfailed\x1b[0m: ${refreshError.message.substring(0, 30)}`);
          }
        });

        await Promise.allSettled(batchPromises);
      }
    } catch (error: any) {
      console.warn(`\x1b[31m!\x1b[0m Refresh | \x1b[31merror\x1b[0m: ${error.message.substring(0, 30)}`);
    } finally {
      this.isRefreshing = false;
    }
  }
}
