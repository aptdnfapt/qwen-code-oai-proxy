import type { AccountUsageSnapshot, DailyRequestUsage, DailyTokenUsage, UsageServiceContract } from "./contracts";

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function createTokenUsage(date: string): DailyTokenUsage {
  return {
    date,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function createRequestUsage(date: string): DailyRequestUsage {
  return {
    date,
    chatRequests: 0,
    webSearchRequests: 0,
    webSearchResults: 0,
  };
}

export class InMemoryUsageStore implements UsageServiceContract {
  private readonly tokenUsage = new Map<string, Map<string, DailyTokenUsage>>();

  private readonly requestUsage = new Map<string, Map<string, DailyRequestUsage>>();

  addChatUsage(accountId: string, inputTokens: number, outputTokens: number): void {
    const date = todayDate();
    const tokenUsage = this.ensureTokenUsage(accountId, date);
    tokenUsage.inputTokens += Math.max(0, inputTokens);
    tokenUsage.outputTokens += Math.max(0, outputTokens);
  }

  addWebSearchUsage(accountId: string, resultCount: number): void {
    const date = todayDate();
    const requestUsage = this.ensureRequestUsage(accountId, date);
    requestUsage.webSearchRequests += 1;
    requestUsage.webSearchResults += Math.max(0, resultCount);
  }

  addChatRequest(accountId: string): void {
    const date = todayDate();
    const requestUsage = this.ensureRequestUsage(accountId, date);
    requestUsage.chatRequests += 1;
  }

  getAccountUsage(accountId: string, date = todayDate()): AccountUsageSnapshot {
    const tokenUsage = this.ensureTokenUsage(accountId, date);
    const requestUsage = this.ensureRequestUsage(accountId, date);
    return {
      accountId,
      tokens: { ...tokenUsage },
      requests: { ...requestUsage },
    };
  }

  listUsage(date = todayDate()): AccountUsageSnapshot[] {
    const accountIds = new Set<string>([...this.tokenUsage.keys(), ...this.requestUsage.keys()]);

    return [...accountIds]
      .sort((a, b) => a.localeCompare(b))
      .map((accountId) => this.getAccountUsage(accountId, date));
  }

  private ensureTokenUsage(accountId: string, date: string): DailyTokenUsage {
    let accountMap = this.tokenUsage.get(accountId);
    if (!accountMap) {
      accountMap = new Map<string, DailyTokenUsage>();
      this.tokenUsage.set(accountId, accountMap);
    }

    let usage = accountMap.get(date);
    if (!usage) {
      usage = createTokenUsage(date);
      accountMap.set(date, usage);
    }

    return usage;
  }

  private ensureRequestUsage(accountId: string, date: string): DailyRequestUsage {
    let accountMap = this.requestUsage.get(accountId);
    if (!accountMap) {
      accountMap = new Map<string, DailyRequestUsage>();
      this.requestUsage.set(accountId, accountMap);
    }

    let usage = accountMap.get(date);
    if (!usage) {
      usage = createRequestUsage(date);
      accountMap.set(date, usage);
    }

    return usage;
  }
}
