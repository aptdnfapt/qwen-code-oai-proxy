import type { AuthCredentials, AuthDeviceFlowResult, AuthServiceContract } from "./contracts";

interface LegacyQwenAuthManager {
  loadCredentials(): Promise<unknown>;
  loadAllAccounts(): Promise<Map<string, unknown>>;
  getAccountIds(): string[];
  getAccountCredentials(accountId: string): unknown;
  isTokenValid(credentials: unknown): boolean;
  shouldRefreshToken(credentials: unknown, accountId?: string | null): boolean;
  refreshAccessToken(credentials: unknown): Promise<unknown>;
  initiateDeviceFlow(): Promise<unknown>;
  pollForToken(deviceCode: string, codeVerifier: string, accountId?: string): Promise<unknown>;
  saveCredentials(credentials: unknown, accountId?: string | null): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
}

function toAuthCredentials(input: unknown): AuthCredentials | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const record = input as Record<string, unknown>;
  if (typeof record.access_token !== "string") {
    return null;
  }

  if (typeof record.expiry_date !== "number") {
    return null;
  }

  return record as AuthCredentials;
}

function toDeviceFlowResult(input: unknown): AuthDeviceFlowResult {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid device flow response");
  }

  return input as AuthDeviceFlowResult;
}

export class LegacyQwenAuthService implements AuthServiceContract {
  constructor(private readonly manager: LegacyQwenAuthManager) {}

  async loadDefaultCredentials(): Promise<AuthCredentials | null> {
    const credentials = await this.manager.loadCredentials();
    return toAuthCredentials(credentials);
  }

  async loadAccounts(): Promise<Map<string, AuthCredentials>> {
    const rawMap = await this.manager.loadAllAccounts();
    const typedMap = new Map<string, AuthCredentials>();

    for (const [accountId, value] of rawMap.entries()) {
      const credentials = toAuthCredentials(value);
      if (credentials) {
        typedMap.set(accountId, credentials);
      }
    }

    return typedMap;
  }

  listAccountIds(): string[] {
    return this.manager.getAccountIds();
  }

  getAccountCredentials(accountId: string): AuthCredentials | null {
    return toAuthCredentials(this.manager.getAccountCredentials(accountId));
  }

  isTokenValid(credentials: AuthCredentials | null): boolean {
    if (!credentials) {
      return false;
    }

    return this.manager.isTokenValid(credentials);
  }

  shouldRefreshToken(credentials: AuthCredentials | null, accountId?: string | null): boolean {
    return this.manager.shouldRefreshToken(credentials, accountId);
  }

  async refreshAccessToken(credentials: AuthCredentials): Promise<AuthCredentials> {
    const refreshed = await this.manager.refreshAccessToken(credentials);
    const typed = toAuthCredentials(refreshed);
    if (!typed) {
      throw new Error("Invalid refreshed credentials");
    }
    return typed;
  }

  async initiateDeviceFlow(): Promise<AuthDeviceFlowResult> {
    const result = await this.manager.initiateDeviceFlow();
    return toDeviceFlowResult(result);
  }

  async pollForToken(deviceCode: string, codeVerifier: string, accountId?: string): Promise<AuthCredentials> {
    const token = await this.manager.pollForToken(deviceCode, codeVerifier, accountId);
    const typed = toAuthCredentials(token);
    if (!typed) {
      throw new Error("Invalid token response");
    }
    return typed;
  }

  async saveCredentials(credentials: AuthCredentials, accountId?: string | null): Promise<void> {
    await this.manager.saveCredentials(credentials, accountId);
  }

  async removeAccount(accountId: string): Promise<void> {
    await this.manager.removeAccount(accountId);
  }
}
