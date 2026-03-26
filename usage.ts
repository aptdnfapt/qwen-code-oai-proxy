#!/usr/bin/env node

const { QwenAuthManager } = require("./src/qwen/auth.js") as any;
const path = require("node:path") as typeof import("node:path");
const { promises: fs } = require("node:fs") as typeof import("node:fs");
const Table = require("cli-table3") as any;

export async function showUsageReport(): Promise<void> {
  console.log("📊 Qwen OpenAI Proxy - Usage Report");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");
  try {
    const authManager = new QwenAuthManager();
    const tokenUsageData = new Map<string, any[]>();
    const chatRequestData = new Map<string, number>();
    const webSearchRequestData = new Map<string, number>();
    const webSearchResultData = new Map<string, number>();
    const requestCountFile = path.join(authManager.qwenDir, "request_counts.json");

    try {
      const data = await fs.readFile(requestCountFile, "utf8");
      const counts = JSON.parse(data) as any;
      if (counts.tokenUsage) for (const [accountId, usageData] of Object.entries(counts.tokenUsage)) tokenUsageData.set(accountId, usageData as any[]);
      if (counts.requests) for (const [accountId, count] of Object.entries(counts.requests)) chatRequestData.set(accountId, Number(count));
      if (counts.webSearchRequests) for (const [accountId, count] of Object.entries(counts.webSearchRequests)) webSearchRequestData.set(accountId, Number(count));
      if (counts.webSearchResults) for (const [accountId, count] of Object.entries(counts.webSearchResults)) webSearchResultData.set(accountId, Number(count));
    } catch {
      console.log("No usage data found.");
      return;
    }

    if (tokenUsageData.size === 0 && chatRequestData.size === 0 && webSearchRequestData.size === 0) {
      console.log("No usage data available.");
      return;
    }

    const dailyUsage = new Map<string, any>();
    const ensureDay = (date: string): any => {
      if (!dailyUsage.has(date)) {
        dailyUsage.set(date, { chatRequests: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, webResults: 0 });
      }
      return dailyUsage.get(date);
    };

    for (const usageData of tokenUsageData.values()) {
      for (const entry of usageData) {
        const day = ensureDay(entry.date);
        day.inputTokens += entry.inputTokens;
        day.outputTokens += entry.outputTokens;
      }
    }

    const today = new Date().toISOString().split("T")[0] as string;
    for (const count of chatRequestData.values()) ensureDay(today).chatRequests += count;
    for (const count of webSearchRequestData.values()) ensureDay(today).webSearches += count;
    for (const count of webSearchResultData.values()) ensureDay(today).webResults += count;

    if (dailyUsage.size === 0) {
      console.log("No usage data available.");
      return;
    }

    const sortedDailyUsage = Array.from(dailyUsage.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const table = new Table({
      head: ["Date", "Chat Req", "Input Tokens", "Output Tokens", "Web Search", "Web Results"],
      colWidths: [12, 10, 15, 16, 12, 13],
      style: { head: ["cyan"], border: ["gray"] },
    });

    let totalChatRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalWebSearches = 0;
    let totalWebResults = 0;

    for (const [date, usage] of sortedDailyUsage) {
      table.push([date, usage.chatRequests.toLocaleString(), usage.inputTokens.toLocaleString(), usage.outputTokens.toLocaleString(), usage.webSearches.toLocaleString(), usage.webResults.toLocaleString()]);
      totalChatRequests += usage.chatRequests;
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalWebSearches += usage.webSearches;
      totalWebResults += usage.webResults;
    }

    table.push([{ content: "TOTAL", colSpan: 1, hAlign: "right" }, totalChatRequests.toLocaleString(), totalInputTokens.toLocaleString(), totalOutputTokens.toLocaleString(), totalWebSearches.toLocaleString(), totalWebResults.toLocaleString()]);
    console.log(table.toString());
    console.log("");
    console.log("📈 Summary:");
    console.log(`• Total Chat Requests: ${totalChatRequests.toLocaleString()}`);
    console.log(`• Total Web Searches: ${totalWebSearches.toLocaleString()}`);
    console.log(`• Total Input Tokens: ${totalInputTokens.toLocaleString()}`);
    console.log(`• Total Output Tokens: ${totalOutputTokens.toLocaleString()}`);
    console.log(`• Total Tokens: ${(totalInputTokens + totalOutputTokens).toLocaleString()}`);
  } catch (error: any) {
    console.error("Failed to show usage report:", error.message);
    process.exit(1);
  }
}

function printUsage(commandName = "npm run usage"): void {
  console.log(`Usage: ${commandName}`);
  console.log("Display daily usage statistics for chat completions and web search.");
}

export async function runUsageCommand(args: string[] = process.argv.slice(2), options: { commandName?: string } = {}): Promise<void> {
  const commandName = options.commandName || "npm run usage";
  if (args.length > 0 && (args[0] === "--help" || args[0] === "-h" || args[0] === "help")) {
    printUsage(commandName);
    return;
  }
  await showUsageReport();
}

if (require.main === module) {
  void runUsageCommand().catch((error: any) => {
    console.error("Usage command failed:", error.message);
    process.exit(1);
  });
}
