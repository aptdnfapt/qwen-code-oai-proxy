const { QwenAuthManager } = require('../qwen/auth.js');
const { DebugLogger } = require('./logger.js');

class AccountRefreshScheduler {
  constructor(qwenAPI) {
    this.qwenAPI = qwenAPI;
    this.refreshInterval = null;
    this.isRefreshing = false; // Flag to prevent concurrent refresh processes
  }

  /**
   * Initialize the account refresh scheduler
   */
  async initialize() {
    console.log('\x1b[36m%s\x1b[0m', 'Initializing account refresh scheduler...');
    
    // Start the refresh scheduler
    await this.startScheduler();
  }

  /**
   * Start the hourly refresh scheduler
   */
  async startScheduler() {
    // Clear any existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Run the check immediately when starting
    await this.checkAndRefreshExpiredAccounts();
    
    // Then run every hour (3600000 milliseconds = 1 hour)
    this.refreshInterval = setInterval(async () => {
      console.log('\x1b[36m%s\x1b[0m', 'Running hourly account refresh check...');
      await this.checkAndRefreshExpiredAccounts();
    }, 3600000); // 1 hour in milliseconds

    console.log('\x1b[32m%s\x1b[0m', 'Account refresh scheduler started - will run every hour');
  }

  /**
   * Stop the refresh scheduler
   */
  stopScheduler() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('\x1b[33m%s\x1b[0m', 'Account refresh scheduler stopped');
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
      console.log('\x1b[36m%s\x1b[0m', 'Checking for expired accounts...');

      // Load all accounts (in case new ones were added)
      await this.qwenAPI.authManager.loadAllAccounts();

      const accountIds = this.qwenAPI.authManager.getAccountIds();

      if (accountIds.length === 0) {
        console.log('\x1b[33m%s\x1b[0m', 'No accounts configured, skipping refresh check');
        return;
      }

      // Separate expired accounts from valid ones for processing
      const expiredAccountIds = [];
      let expiredAccountsFound = false;

      for (const accountId of accountIds) {
        const credentials = this.qwenAPI.authManager.getAccountCredentials(accountId);

        if (!credentials) {
          console.log(`\x1b[31m%s\x1b[0m`, `No credentials found for account ${accountId}`);
          continue;
        }

        // Check if the account token is expired or expiring soon
        const isExpired = !this.qwenAPI.authManager.isTokenValid(credentials);
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000; // Convert to minutes

        if (isExpired) {
          expiredAccountsFound = true;
          expiredAccountIds.push(accountId);
          console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} is expired (was valid until ${new Date(credentials.expiry_date).toISOString()})`);
        } else if (minutesLeft < 60) { // Warn if expiring within the next hour
          console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} token expires in ${minutesLeft.toFixed(1)} minutes`);
        } else {
          console.log(`\x1b[32m%s\x1b[0m`, `Account ${accountId} token is valid for ${minutesLeft.toFixed(1)} more minutes`);
        }
      }

      if (!expiredAccountsFound) {
        console.log('\x1b[32m%s\x1b[0m', 'No expired accounts found');
        return;
      }

      // Process expired accounts in parallel batches of 20
      const batchSize = 20;
      for (let i = 0; i < expiredAccountIds.length; i += batchSize) {
        const batch = expiredAccountIds.slice(i, i + batchSize);

        // Add random wait time before processing each batch to avoid rate limits
        if (i > 0) { // Don't wait before the first batch
          const sleepDuration = Math.floor(Math.random() * (5 - 1 + 1) + 1) * 60000; // 1-5 minutes
          console.log(`\x1b[36m%s\x1b[0m`, `Waiting ${sleepDuration / 60000} minutes before processing next batch...`);
          await new Promise(resolve => setTimeout(resolve, sleepDuration));
        }

        // Process the current batch in parallel
        const batchPromises = batch.map(async (accountId) => {
          const credentials = this.qwenAPI.authManager.getAccountCredentials(accountId);

          if (!credentials) {
            console.log(`\x1b[31m%s\x1b[0m`, `No credentials found for account ${accountId}`);
            return;
          }

          // Use account lock to prevent conflicts during refresh
          const lockAcquired = await this.qwenAPI.acquireAccountLock(accountId);
          if (lockAcquired) {
            try {
              // Attempt to refresh the token
              const refreshedCredentials = await this.qwenAPI.authManager.performTokenRefresh(credentials, accountId);
              console.log(`\x1b[32m%s\x1b[0m`, `Successfully refreshed token for account ${accountId}. New expiry: ${new Date(refreshedCredentials.expiry_date).toISOString()}`);
            } catch (refreshError) {
              console.log(`\x1b[31m%s\x1b[0m`, `Failed to refresh token for account ${accountId}: ${refreshError.message}`);
            } finally {
              // Always release the lock after refresh attempt
              this.qwenAPI.releaseAccountLock(accountId);
            }
          } else {
            console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} is currently in use, skipping refresh`);
          }
        });

        // Wait for all promises in the current batch to complete
        await Promise.allSettled(batchPromises);
      }

      console.log('\x1b[32m%s\x1b[0m', 'Expired account refresh check completed');
    } catch (error) {
      console.log(`\x1b[31m%s\x1b[0m`, `Error during account refresh check: ${error.message}`);
    } finally {
      // Reset the flag to indicate the refresh process is complete
      this.isRefreshing = false;
    }
  }

  /**
   * Force a refresh of all accounts (not just expired ones)
   */
  async forceRefreshAllAccounts() {
    console.log('\x1b[36m%s\x1b[0m', 'Forcing refresh of all accounts...');
    
    // Load all accounts
    await this.qwenAPI.authManager.loadAllAccounts();
    
    const accountIds = this.qwenAPI.authManager.getAccountIds();
    
    if (accountIds.length === 0) {
      console.log('\x1b[33m%s\x1b[0m', 'No accounts configured');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const accountId of accountIds) {
      const credentials = this.qwenAPI.authManager.getAccountCredentials(accountId);
      
      if (!credentials) {
        console.log(`\x1b[31m%s\x1b[0m`, `No credentials found for account ${accountId}`);
        failCount++;
        continue;
      }

      // Use account lock to prevent conflicts during refresh
      const lockAcquired = await this.qwenAPI.acquireAccountLock(accountId);
      if (lockAcquired) {
        try {
          // Force refresh regardless of expiration status
          const refreshedCredentials = await this.qwenAPI.authManager.performTokenRefresh(credentials, accountId);
          console.log(`\x1b[32m%s\x1b[0m`, `Successfully refreshed token for account ${accountId}. New expiry: ${new Date(refreshedCredentials.expiry_date).toISOString()}`);
          successCount++;
        } catch (refreshError) {
          console.log(`\x1b[31m%s\x1b[0m`, `Failed to refresh token for account ${accountId}: ${refreshError.message}`);
          failCount++;
        } finally {
          // Always release the lock after refresh attempt
          this.qwenAPI.releaseAccountLock(accountId);
        }
      } else {
        console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} is currently in use, skipping refresh`);
        failCount++;
      }
    }

    console.log(`\x1b[36m%s\x1b[0m`, `Force refresh completed: ${successCount} successful, ${failCount} skipped or failed`);
  }
}

module.exports = { AccountRefreshScheduler };