export type AccountHealthStatus = "healthy" | "expiring_soon" | "expired" | "invalid";

export interface AccountDescriptor {
  id: string;
  status: AccountHealthStatus;
  expiresInMinutes?: number;
  requestCountToday?: number;
  webSearchCountToday?: number;
}

export interface AccountSelectionResult {
  accountId: string;
  reason: "forced" | "default" | "round_robin";
}

export interface AccountServiceContract {
  listAccounts(): AccountDescriptor[];
  selectAccount(preferredAccountId?: string): AccountSelectionResult | null;
  markAccountUnhealthy(accountId: string): void;
  resetHealth(accountId: string): void;
}
