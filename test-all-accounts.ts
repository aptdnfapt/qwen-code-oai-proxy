#!/usr/bin/env node

const axios: any = require("axios");
const { QwenAuthManager } = require("./src/qwen/auth.js") as any;
const { QwenAPI } = require("./src/qwen/api.js") as any;
const Table = require("cli-table3") as any;

const PROXY_URL = process.env.PROXY_URL || "http://localhost:8087";
const TEST_PROMPT = "Hello! Please respond with just 'Account test successful' and nothing else.";
const TEST_TIMEOUT = 30000;
const colors = { reset: "\x1b[0m", bright: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m" };

function colorText(text: string | number, color: string): string {
  return `${color}${text}${colors.reset}`;
}

export async function testAccount(accountId: string): Promise<any> {
  const startTime = Date.now();
  const result: any = { accountId, status: "unknown", error: null, responseTime: null, model: null, tokensUsed: null };
  try {
    console.log(colorText(`Testing account: ${accountId}`, colors.cyan));
    const authManager = new QwenAuthManager();
    await authManager.loadAllAccounts();
    const creds = authManager.getAccountCredentials(accountId);
    if (!creds) throw new Error("No credentials found");
    if (!authManager.isTokenValid(creds)) {
      await authManager.performTokenRefresh(creds, accountId);
    }

    const response = await axios.post(`${PROXY_URL}/v1/chat/completions`, { model: "qwen3-coder-plus", messages: [{ role: "user", content: TEST_PROMPT }], temperature: 0.1, max_tokens: 50 }, { headers: { "Content-Type": "application/json", "X-Qwen-Account": accountId }, timeout: TEST_TIMEOUT });
    const responseTime = Date.now() - startTime;

    if (response.data?.choices?.length > 0) {
      const reply = response.data.choices[0].message?.content || "";
      if (reply.toLowerCase().includes("successful")) {
        result.status = "success";
        result.responseTime = responseTime;
        result.model = response.data.model || "unknown";
        result.tokensUsed = response.data.usage?.total_tokens || 0;
        console.log(colorText(`  ✓ Success (${responseTime}ms) - Tokens: ${result.tokensUsed}`, colors.green));
      } else {
        result.status = "invalid_response";
        result.error = `Unexpected response: ${reply.substring(0, 100)}`;
        result.responseTime = responseTime;
        console.log(colorText(`  ✗ Invalid response (${responseTime}ms)`, colors.yellow));
      }
    } else {
      result.status = "malformed_response";
      result.error = "Malformed response structure";
      result.responseTime = Date.now() - startTime;
      console.log(colorText("  ✗ Malformed response", colors.red));
    }
  } catch (error: any) {
    result.responseTime = Date.now() - startTime;
    if (error.code === "ECONNREFUSED") {
      result.status = "proxy_offline";
      result.error = "Proxy server is not running";
      console.log(colorText("  ✗ Proxy server offline", colors.red));
    } else if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") {
      result.status = "timeout";
      result.error = "Request timeout";
      console.log(colorText(`  ✗ Timeout (${TEST_TIMEOUT / 1000}s)`, colors.red));
    } else if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data || {};
      if (status === 401) {
        result.status = "auth_failed";
        result.error = "Authentication failed";
      } else if (status === 429) {
        result.status = "quota_exceeded";
        result.error = "Quota exceeded";
      } else if (status >= 500) {
        result.status = "server_error";
        result.error = `Server error (${status})`;
      } else {
        result.status = "http_error";
        result.error = `HTTP error (${status}): ${errorData.error?.message || "Unknown"}`;
      }
      console.log(colorText(`  ✗ ${result.error}`, status === 429 ? colors.yellow : colors.red));
    } else {
      result.status = "network_error";
      result.error = error.message;
      console.log(colorText(`  ✗ Network error: ${error.message}`, colors.red));
    }
  }
  return result;
}

export async function testAllAccounts(): Promise<void> {
  console.log(colorText("\n🧪 Testing All Qwen Accounts", colors.bright + colors.blue));
  console.log(colorText("=".repeat(50), colors.blue));
  const authManager = new QwenAuthManager();
  new QwenAPI();

  try {
    await authManager.loadAllAccounts();
    const accountIds = authManager.getAccountIds();
    if (accountIds.length === 0) {
      console.log(colorText("❌ No accounts found. Please add accounts first.", colors.red));
      console.log(colorText("   Run: npm run auth:add <account-name>", colors.yellow));
      return;
    }

    console.log(colorText(`Found ${accountIds.length} account(s): ${accountIds.join(", ")}`, colors.cyan));
    console.log("");
    try {
      await axios.get(`${PROXY_URL}/health`, { timeout: 5000 });
    } catch {
      console.log(colorText("❌ Proxy server is not running!", colors.red));
      console.log(colorText(`   Expected at: ${PROXY_URL}`, colors.yellow));
      console.log(colorText("   Start it with: npm start", colors.yellow));
      return;
    }

    const results = [];
    for (const accountId of accountIds) {
      results.push(await testAccount(accountId));
      console.log("");
    }

    console.log(colorText("📊 Test Results Summary", colors.bright + colors.blue));
    console.log(colorText("=".repeat(50), colors.blue));
    const table = new Table({ head: [colorText("Account", colors.bright), colorText("Status", colors.bright), colorText("Response Time", colors.bright), colorText("Tokens", colors.bright), colorText("Error", colors.bright)], colWidths: [15, 15, 15, 10, 30] });

    let successCount = 0;
    let totalTokens = 0;
    for (const result of results) {
      const statusColor = result.status === "success" ? colors.green : (result.status === "quota_exceeded" ? colors.yellow : colors.red);
      const statusIcon = result.status === "success" ? "✓" : (result.status === "quota_exceeded" ? "⚠" : "✗");
      table.push([result.accountId, colorText(`${statusIcon} ${result.status}`, statusColor), result.responseTime ? `${result.responseTime}ms` : "N/A", result.tokensUsed || "N/A", result.error ? (result.error.length > 25 ? `${result.error.substring(0, 25)}...` : result.error) : ""]);
      if (result.status === "success") {
        successCount += 1;
        totalTokens += result.tokensUsed || 0;
      }
    }

    console.log(table.toString());
    console.log(colorText("\n📈 Statistics:", colors.bright + colors.cyan));
    console.log(colorText(`   Total accounts: ${results.length}`, colors.white));
    console.log(colorText(`   Successful: ${colorText(successCount, colors.green)}`, colors.white));
    console.log(colorText(`   Failed: ${colorText(results.length - successCount, colors.red)}`, colors.white));
    console.log(colorText(`   Success rate: ${((successCount / results.length) * 100).toFixed(1)}%`, colors.white));
    console.log(colorText(`   Total tokens used: ${totalTokens}`, colors.white));
  } catch (error: any) {
    console.log(colorText(`❌ Error during testing: ${error.message}`, colors.red));
    console.log(error.stack);
  }
}

async function main(): Promise<void> {
  console.log(colorText("🚀 Qwen Account Test Suite", colors.bright + colors.cyan));
  console.log(colorText(`Testing proxy at: ${PROXY_URL}`, colors.cyan));
  await testAllAccounts();
  console.log(colorText("\n✨ Test completed!", colors.bright + colors.magenta));
}

process.on("SIGINT", () => {
  console.log(colorText("\n\n⚠️  Test interrupted by user", colors.yellow));
  process.exit(0);
});

if (require.main === module) {
  void main().catch((error: any) => {
    console.log(colorText(`\n💥 Fatal error: ${error.message}`, colors.red));
    process.exit(1);
  });
}
