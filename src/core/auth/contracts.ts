export interface AuthCredentials {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expiry_date: number;
  [key: string]: unknown;
}

export interface AuthDeviceFlowResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval?: number;
  expires_in?: number;
  code_verifier?: string;
  [key: string]: unknown;
}

export interface AuthServiceContract {
  loadDefaultCredentials(): Promise<AuthCredentials | null>;
  loadAccounts(): Promise<Map<string, AuthCredentials>>;
  listAccountIds(): string[];
  getAccountCredentials(accountId: string): AuthCredentials | null;
  isTokenValid(credentials: AuthCredentials | null): boolean;
  shouldRefreshToken(credentials: AuthCredentials | null, accountId?: string | null): boolean;
  refreshAccessToken(credentials: AuthCredentials): Promise<AuthCredentials>;
  initiateDeviceFlow(): Promise<AuthDeviceFlowResult>;
  pollForToken(deviceCode: string, codeVerifier: string, accountId?: string): Promise<AuthCredentials>;
  saveCredentials(credentials: AuthCredentials, accountId?: string | null): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
}
