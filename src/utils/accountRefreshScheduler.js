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
    
    // Then run every hour (60 * 60 * 1000 milliseconds = 1 hour)
    this.refreshInterval = setInterval(async () => {
      console.log('\x1b[36m%s\x1b[0m', 'Running background account refresh check...');
      await this.checkAndRefreshExpiredAccounts();
    }, 5 * 60 * 1000); // Changed to every 5 minutes for more frequent checks

    console.log('\x1b[32m%s\x1b[0m', 'Account refresh scheduler started - will run in background every 5 minutes');
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

      // Separate accounts that need refresh (expired or expiring soon) for processing
      const accountsToRefresh = [];
      let expiredAccountsFound = false;

      for (const accountId of accountIds) {
        const credentials = this.qwenAPI.authManager.getAccountCredentials(accountId);

        if (!credentials) {
          console.log(`\x1b[31m%s\x1b[0m`, `No credentials found for account ${accountId}`);
          continue;
        }

        // Check if the account token is actually expired (past expiry date)
        const isExpired = credentials.expiry_date <= Date.now();
        const minutesLeft = (credentials.expiry_date - Date.now()) / 60000; // Convert to minutes

        if (isExpired) {
          expiredAccountsFound = true;
          accountsToRefresh.push(accountId);
          console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} is expired (was valid until ${new Date(credentials.expiry_date).toISOString()})`);
        } else if (minutesLeft <= 10) {
          // Always include accounts expiring within 10 minutes
          expiredAccountsFound = true;
          accountsToRefresh.push(accountId);
          console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} expires in ${minutesLeft.toFixed(1)} minutes (within 10 minute threshold), including for proactive refresh`);
        } else {
          // Generate a random threshold (1-30 minutes) for proactive refresh for each account
          const refreshThresholdMinutes = Math.floor(Math.random() * 21) + 10; // Random between 10 and 30 minutes

          if (minutesLeft <= refreshThresholdMinutes) {
            // Include accounts that will expire soon (within the random threshold)
            expiredAccountsFound = true;
            accountsToRefresh.push(accountId);
            console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} expires in ${minutesLeft.toFixed(1)} minutes (less than ${refreshThresholdMinutes} minute threshold), including for proactive refresh`);
          } else if (minutesLeft < 60) { // Warn if expiring within the next hour but not included for refresh
            console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} token expires in ${minutesLeft.toFixed(1)} minutes`);
          } else {
            console.log(`\x1b[32m%s\x1b[0m`, `Account ${accountId} token is valid for ${minutesLeft.toFixed(1)} more minutes`);
          }
        }
      }

      if (!expiredAccountsFound) {
        console.log('\x1b[32m%s\x1b[0m', 'No accounts need refresh (no expired or soon-to-expire accounts)');
        return;
      }

      // Process accounts that need refresh in parallel batches of 20
      const batchSize = 20;
      for (let i = 0; i < accountsToRefresh.length; i += batchSize) {
        const batch = accountsToRefresh.slice(i, i + batchSize);

        // Process the current batch in parallel
        const batchPromises = batch.map(async (accountId) => {
          const credentials = this.qwenAPI.authManager.getAccountCredentials(accountId);

          if (!credentials) {
            console.log(`\x1b[31m%s\x1b[0m`, `No credentials found for account ${accountId}`);
            return;
          }
          
          // We no longer need to lock accounts here since performTokenRefresh handles locking internally
          // // Use account lock to prevent conflicts during refresh
          // const lockAcquired = await this.qwenAPI.acquireAccountLock(accountId);
          // if (lockAcquired) {
          //   try {
          //     // Attempt to refresh the token
          //     const refreshedCredentials = await this.qwenAPI.authManager.performTokenRefresh(credentials, accountId);
          //     console.log(`\x1b[32m%s\x1b[0m`, `Successfully refreshed token for account ${accountId}. New expiry: ${new Date(refreshedCredentials.expiry_date).toISOString()}`);
          //   } catch (refreshError) {
          //     console.log(`\x1b[31m%s\x1b[0m`, `Failed to refresh token for account ${accountId}: ${refreshError.message}`);
          //   } finally {
          //     // Always release the lock after refresh attempt
          //     this.qwenAPI.releaseAccountLock(accountId);
          //   }
          // } else {
          //   console.log(`\x1b[33m%s\x1b[0m`, `Account ${accountId} is currently in use, skipping refresh`);
          // }

          try {
            // Attempt to refresh the token
            const refreshedCredentials = await this.qwenAPI.authManager.performTokenRefresh(credentials, accountId);
            console.log(`\x1b[32m%s\x1b[0m`, `Successfully refreshed token for account ${accountId}. New expiry: ${new Date(refreshedCredentials.expiry_date).toISOString()}`);
          } catch (refreshError) {
            console.log(`\x1b[31m%s\x1b[0m`, `Failed to refresh token for account ${accountId}: ${refreshError.message}`);
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