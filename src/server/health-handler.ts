function formatAccountStatus(credentials: any, needsRefresh: boolean): { status: string; expiresIn: number | null } {
  if (!credentials || !credentials.expiry_date) {
    return {
      status: "unknown",
      expiresIn: null,
    };
  }

  const minutesLeft = (credentials.expiry_date - Date.now()) / 60000;
  const status = minutesLeft < 0 ? "expired" : (needsRefresh ? "expiring_soon" : "healthy");

  return {
    status,
    expiresIn: Math.max(0, minutesLeft),
  };
}

async function loadAuthSnapshot(authManager: any, authService: any): Promise<any> {
  if (authService) {
    await authService.loadAccounts();
    return {
      defaultCredentials: await authService.loadDefaultCredentials(),
      accountIds: authService.listAccountIds(),
      getAccountCredentials: (accountId: string) => authService.getAccountCredentials(accountId),
      shouldRefreshToken: (credentials: any, accountId: string | null) => authService.shouldRefreshToken(credentials, accountId),
    };
  }

  await authManager.loadAllAccounts();
  return {
    defaultCredentials: await authManager.loadCredentials(),
    accountIds: authManager.getAccountIds(),
    getAccountCredentials: (accountId: string) => authManager.getAccountCredentials(accountId),
    shouldRefreshToken: (credentials: any, accountId: string | null) => authManager.shouldRefreshToken(credentials, accountId),
  };
}

export function createHealthHandler({ qwenAPI, authService }: { qwenAPI: any; authService: any }) {
  return async (req: any, res: any): Promise<void> => {
    try {
      const authSnapshot = await loadAuthSnapshot(qwenAPI.authManager, authService);
      const { defaultCredentials, accountIds, getAccountCredentials, shouldRefreshToken } = authSnapshot;

      const accounts: any[] = [];
      const accountsNeedingRefresh: string[] = [];
      let totalRequestsToday = 0;

      if (defaultCredentials) {
        const needsRefresh = shouldRefreshToken(defaultCredentials, null);
        const accountStatus = formatAccountStatus(defaultCredentials, needsRefresh);
        const requestCount = qwenAPI.getRequestCount("default");
        const webSearchCount = qwenAPI.getWebSearchRequestCount("default");
        totalRequestsToday += requestCount;

        if (needsRefresh) {
          accountsNeedingRefresh.push("default");
        }

        accounts.push({
          id: "default",
          status: accountStatus.status,
          expiresIn: accountStatus.expiresIn ? `${accountStatus.expiresIn.toFixed(1)} minutes` : null,
          requestCount,
          webSearchCount,
        });
      }

      for (const accountId of accountIds) {
        const credentials = getAccountCredentials(accountId);
        const needsRefresh = credentials ? shouldRefreshToken(credentials, accountId) : false;
        const accountStatus = formatAccountStatus(credentials, needsRefresh);

        if (needsRefresh) {
          accountsNeedingRefresh.push(accountId);
        }

        const requestCount = qwenAPI.getRequestCount(accountId);
        const webSearchCount = qwenAPI.getWebSearchRequestCount(accountId);
        totalRequestsToday += requestCount;

        accounts.push({
          id: accountId.substring(0, 5),
          status: accountStatus.status,
          expiresIn: accountStatus.expiresIn ? `${accountStatus.expiresIn.toFixed(1)} minutes` : null,
          requestCount,
          webSearchCount,
        });
      }

      const healthyCount = accounts.filter((entry) => entry.status === "healthy").length;
      const expiringSoonCount = accounts.filter((entry) => entry.status === "expiring_soon").length;
      const expiredCount = accounts.filter((entry) => entry.status === "expired").length;

      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const today = new Date().toISOString().split("T")[0];
      for (const usageData of qwenAPI.tokenUsage.values()) {
        const todayUsage = usageData.find((entry: any) => entry.date === today);
        if (todayUsage) {
          totalInputTokens += todayUsage.inputTokens;
          totalOutputTokens += todayUsage.outputTokens;
        }
      }

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        summary: {
          total: accounts.length,
          healthy: healthyCount,
          expiring_soon: expiringSoonCount,
          expired: expiredCount,
          total_requests_today: totalRequestsToday,
          lastReset: qwenAPI.lastResetDate,
        },
        token_usage: {
          input_tokens_today: totalInputTokens,
          output_tokens_today: totalOutputTokens,
          total_tokens_today: totalInputTokens + totalOutputTokens,
        },
        accounts,
        health: {
          rotation: "round_robin",
          persistentCooldowns: false,
          preemptiveRefreshWindowMinutes: "10-30",
          accountsNeedingRefresh,
        },
        server_info: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          node_version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
        endpoints: {
          openai: `${req.protocol}://${req.get("host")}/v1`,
          health: `${req.protocol}://${req.get("host")}/health`,
        },
      });
    } catch (error: any) {
      console.error("Health check error:", error.message);
      res.status(500).json({
        status: "error",
        timestamp: new Date().toISOString(),
        error: error.message,
        server_info: {
          uptime: process.uptime(),
          node_version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      });
    }
  };
}
