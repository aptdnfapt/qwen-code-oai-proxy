import type { AccountDescriptor, AccountSelectionResult, AccountServiceContract } from "./contracts";

function isHealthy(account: AccountDescriptor): boolean {
  return account.status === "healthy" || account.status === "expiring_soon";
}

export class RoundRobinAccountService implements AccountServiceContract {
  private pointer = 0;

  private readonly unhealthy = new Set<string>();

  constructor(private readonly getAccounts: () => AccountDescriptor[], private readonly defaultAccountId?: string) {}

  listAccounts(): AccountDescriptor[] {
    return this.getAccounts();
  }

  selectAccount(preferredAccountId?: string): AccountSelectionResult | null {
    const accounts = this.getAccounts().filter((account) => isHealthy(account) && !this.unhealthy.has(account.id));
    if (accounts.length === 0) {
      return null;
    }

    if (preferredAccountId) {
      const forced = accounts.find((account) => account.id === preferredAccountId);
      if (forced) {
        return { accountId: forced.id, reason: "forced" };
      }
    }

    if (this.defaultAccountId) {
      const defaultAccount = accounts.find((account) => account.id === this.defaultAccountId);
      if (defaultAccount) {
        return { accountId: defaultAccount.id, reason: "default" };
      }
    }

    const index = this.pointer % accounts.length;
    this.pointer = (this.pointer + 1) % accounts.length;
    return {
      accountId: accounts[index].id,
      reason: "round_robin",
    };
  }

  markAccountUnhealthy(accountId: string): void {
    this.unhealthy.add(accountId);
  }

  resetHealth(accountId: string): void {
    this.unhealthy.delete(accountId);
  }
}
