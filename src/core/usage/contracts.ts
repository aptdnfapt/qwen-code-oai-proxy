export interface DailyTokenUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
}

export interface DailyRequestUsage {
  date: string;
  chatRequests: number;
  webSearchRequests: number;
  webSearchResults: number;
}

export interface AccountUsageSnapshot {
  accountId: string;
  tokens: DailyTokenUsage;
  requests: DailyRequestUsage;
}

export interface UsageServiceContract {
  addChatUsage(accountId: string, inputTokens: number, outputTokens: number): void;
  addWebSearchUsage(accountId: string, resultCount: number): void;
  addChatRequest(accountId: string): void;
  getAccountUsage(accountId: string, date?: string): AccountUsageSnapshot;
  listUsage(date?: string): AccountUsageSnapshot[];
}
