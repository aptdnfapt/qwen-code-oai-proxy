#!/usr/bin/env node

const { QwenAuthManager } = require("./src/qwen/auth.js") as any;
const usageStore = require("./src/utils/usageStore.js") as typeof import("./src/utils/usageStore.js");
const qrcode = require("qrcode-terminal") as any;
const open = require("open") as any;

export async function listAccounts(): Promise<void> {
  console.log("Listing all Qwen accounts...");
  try {
    const authManager = new QwenAuthManager();
    await authManager.loadAllAccounts();
    const accountIds = authManager.getAccountIds();
    const defaultCredentials = await authManager.loadCredentials();

    if (accountIds.length === 0 && !defaultCredentials) {
      console.log("No accounts found.");
      return;
    }

    const totalAccounts = accountIds.length + (defaultCredentials ? 1 : 0);
    console.log(`\nFound ${totalAccounts} account(s):\n`);

    if (defaultCredentials) {
      const isValid = authManager.isTokenValid(defaultCredentials);
      console.log(`\n\x1b[36mDefault account: ${isValid ? "✅ Valid" : "❌ Invalid/Expired"}\x1b[0m`);
      console.log("\n\x1b[33mNote: Try using the proxy to make sure the account is not invalid\x1b[0m");
    }

    for (const accountId of accountIds) {
      const credentials = authManager.getAccountCredentials(accountId);
      const isValid = authManager.isAccountValid(accountId);
      console.log(`Account ID: ${accountId}`);
      console.log(`  Status: ${isValid ? "✅ Valid" : "❌ Invalid/Expired"}`);
      if (credentials?.expiry_date) {
        console.log(`  Expires: ${new Date(credentials.expiry_date).toLocaleString()}`);
      }
      console.log("");
    }
  } catch (error: any) {
    console.error("Failed to list accounts:", error.message);
    process.exit(1);
  }
}

export async function addAccount(accountId: string): Promise<void> {
  console.log(`Adding new Qwen account with ID: ${accountId}...`);
  try {
    const authManager = new QwenAuthManager();
    console.log("\nInitiating device flow...");
    const deviceFlow = await authManager.initiateDeviceFlow();
    console.log("\n=== Qwen OAuth Device Authorization ===");
    console.log("Please visit the following URL to authenticate:");
    console.log(`\n${deviceFlow.verification_uri_complete}\n`);
    console.log("Or scan the QR code below:");
    qrcode.generate(deviceFlow.verification_uri_complete, { small: true }, (qrCode: string) => {
      console.log(qrCode);
    });
    console.log("User code:", deviceFlow.user_code);
    console.log("(Press Ctrl+C to cancel)");

    try {
      await open(deviceFlow.verification_uri_complete);
      console.log("\nBrowser opened automatically. If not, please visit the URL above.");
    } catch {
      console.log("\nPlease visit the URL above in your browser to authenticate.");
    }

    console.log("\nWaiting for authentication...");
    await authManager.pollForToken(deviceFlow.device_code, deviceFlow.code_verifier, accountId);
    console.log(`\n🎉 Authentication successful for account ${accountId}!`);
    console.log(`Access token saved to ~/.qwen/oauth_creds_${accountId}.json`);
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

export async function removeAccount(accountId: string): Promise<void> {
  console.log(`Removing Qwen account with ID: ${accountId}...`);
  try {
    const authManager = new QwenAuthManager();
    await authManager.removeAccount(accountId);
    console.log(`\n✅ Account ${accountId} removed successfully!`);
  } catch (error: any) {
    console.error("Failed to remove account:", error.message);
    process.exit(1);
  }
}

export async function checkRequestCounts(): Promise<void> {
  console.log("Checking request counts for all accounts...");
  try {
    const authManager = new QwenAuthManager();
    await authManager.loadAllAccounts();
    const accountIds = authManager.getAccountIds();
    const defaultCredentials = await authManager.loadCredentials();

    if (accountIds.length === 0 && !defaultCredentials) {
      console.log("No accounts found.");
      return;
    }

    const totalAccounts = accountIds.length + (defaultCredentials ? 1 : 0);
    console.log(`\nFound ${totalAccounts} account(s):\n`);

    await usageStore.openUsageStore();
    const requestCounts = usageStore.getAllTodayRequestCounts(usageStore.getLastResetDate());

    for (const accountId of accountIds) {
      const count = requestCounts.get(accountId) || 0;
      const credentials = authManager.getAccountCredentials(accountId);
      const isValid = Boolean(credentials && authManager.isTokenValid(credentials));
      console.log(`Account ID: ${accountId}`);
      console.log(`  Status: ${isValid ? "✅ Valid" : "❌ Invalid/Expired"}`);
      console.log(`  Requests today: ${count}/2000`);
      if (credentials?.expiry_date) {
        console.log(`  Expires: ${new Date(credentials.expiry_date).toLocaleString()}`);
      }
      console.log("");
    }

    if (defaultCredentials) {
      const isValid = authManager.isTokenValid(defaultCredentials);
      const defaultCount = requestCounts.get("default") || 0;
      console.log("Default account:");
      console.log(`  Status: ${isValid ? "✅ Valid" : "❌ Invalid/Expired"}`);
      console.log(`  Requests today: ${defaultCount}/2000`);
      if (defaultCredentials.expiry_date) {
        console.log(`  Expires: ${new Date(defaultCredentials.expiry_date).toLocaleString()}`);
      }
      console.log("");
    }
  } catch (error: any) {
    console.error("Failed to check request counts:", error.message);
    process.exit(1);
  }
}

export async function authenticate(): Promise<void> {
  console.log("Starting Qwen authentication flow...");
  try {
    const authManager = new QwenAuthManager();
    console.log("Checking for existing credentials...");
    const existingCredentials = await authManager.loadCredentials();
    if (existingCredentials && authManager.isTokenValid(existingCredentials)) {
      console.log("\n✅ Valid credentials already exist!");
      console.log("Access token is still valid and will be used by the proxy server.");
      console.log("\nYou can start the proxy server with: npm start");
      return;
    }

    if (existingCredentials) {
      console.log("Existing credentials found but they are expired or invalid.");
      console.log("Attempting to refresh the access token...");
      try {
        await authManager.refreshAccessToken(existingCredentials);
        console.log("\n✅ Token refreshed successfully!");
        console.log("Access token has been updated and will be used by the proxy server.");
        console.log("\nYou can start the proxy server with: npm start");
        return;
      } catch (refreshError: any) {
        console.log("Failed to refresh token:", refreshError.message);
        console.log("Proceeding with new authentication flow...");
      }
    }

    console.log("\nInitiating device flow...");
    const deviceFlow = await authManager.initiateDeviceFlow();
    console.log("\n=== Qwen OAuth Device Authorization ===");
    console.log("Please visit the following URL to authenticate:");
    console.log(`\n${deviceFlow.verification_uri_complete}\n`);
    console.log("Or scan the QR code below:");
    qrcode.generate(deviceFlow.verification_uri_complete, { small: true }, (qrCode: string) => {
      console.log(qrCode);
    });
    console.log("User code:", deviceFlow.user_code);
    console.log("(Press Ctrl+C to cancel)");

    try {
      await open(deviceFlow.verification_uri_complete);
      console.log("\nBrowser opened automatically. If not, please visit the URL above.");
    } catch {
      console.log("\nPlease visit the URL above in your browser to authenticate.");
    }

    console.log("\nWaiting for authentication...");
    await authManager.pollForToken(deviceFlow.device_code, deviceFlow.code_verifier);
    console.log("\n🎉 Authentication successful!");
    console.log("Access token saved to ~/.qwen/oauth_creds.json");
    console.log("\nYou can now start the proxy server with: npm start");
  } catch (error: any) {
    console.error("Authentication failed:", error.message);
    process.exit(1);
  }
}

function printAuthUsage(commandPrefix = "npm run auth"): void {
  console.log(`Usage: ${commandPrefix} [list|add <account-id>|remove <account-id>|counts]`);
  console.log("  list                - List all accounts");
  console.log("  add <account-id>    - Add a new account with the specified ID");
  console.log("  remove <account-id> - Remove an existing account with the specified ID");
  console.log("  counts              - Check request counts for all accounts");
  console.log("  (no arguments)      - Authenticate default account");
}

export async function runAuthCommand(args: string[] = process.argv.slice(2), options: { commandPrefix?: string } = {}): Promise<void> {
  const commandPrefix = options.commandPrefix || "npm run auth";
  const command = args[0];
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printAuthUsage(commandPrefix);
      return;
    case "list":
      await listAccounts();
      return;
    case "add":
      if (!args[1]) {
        console.error(`Please provide an account ID: ${commandPrefix} add <account-id>`);
        process.exit(1);
      }
      await addAccount(args[1]);
      return;
    case "remove":
      if (!args[1]) {
        console.error(`Please provide an account ID: ${commandPrefix} remove <account-id>`);
        process.exit(1);
      }
      await removeAccount(args[1]);
      return;
    case "counts":
      await checkRequestCounts();
      return;
    case undefined:
    case "":
      await authenticate();
      return;
    default:
      printAuthUsage(commandPrefix);
      process.exit(1);
  }
}

if (require.main === module) {
  void runAuthCommand().catch((error: any) => {
    console.error("Authentication command failed:", error.message);
    process.exit(1);
  });
}
