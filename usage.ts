#!/usr/bin/env node

const usageStore = require("./src/utils/usageStore.js") as typeof import("./src/utils/usageStore.js");
const Table = require("cli-table3") as any;

type DailyUsageSummary = {
  chatRequests: number;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  webResults: number;
};

function createEmptyDay(): DailyUsageSummary {
  return {
    chatRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    webSearches: 0,
    webResults: 0,
  };
}

export async function showUsageReport(): Promise<void> {
  console.log("📊 Qwen OpenAI Proxy - Usage Report");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");
  try {
    await usageStore.openUsageStore();
    const tokenUsageData = usageStore.getAllUsage();
    const webSearchTotals = usageStore.getTotalWebSearchCounts();

    const dailyUsage = new Map<string, DailyUsageSummary>();
    const ensureDay = (date: string): DailyUsageSummary => {
      if (!dailyUsage.has(date)) {
        dailyUsage.set(date, createEmptyDay());
      }
      return dailyUsage.get(date) as DailyUsageSummary;
    };

    for (const usageData of tokenUsageData.values()) {
      for (const entry of usageData) {
        const day = ensureDay(entry.date);
        day.chatRequests += entry.requests;
        day.inputTokens += entry.inputTokens;
        day.outputTokens += entry.outputTokens;
      }
    }

    if (webSearchTotals.requests > 0 || webSearchTotals.results > 0) {
      const today = new Date().toISOString().split("T")[0] as string;
      const day = ensureDay(today);
      day.webSearches += webSearchTotals.requests;
      day.webResults += webSearchTotals.results;
    }

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
