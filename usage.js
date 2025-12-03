#!/usr/bin/env node

const { QwenAuthManager } = require('./src/qwen/auth.js');
const path = require('path');
const { promises: fs } = require('fs');
const Table = require('cli-table3');

async function showUsageReport() {
  console.log('📊 Qwen OpenAI Proxy - Usage Report');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  
  try {
    const authManager = new QwenAuthManager();
    
    // Load usage data from persisted file
    let tokenUsageData = new Map();
    let chatRequestData = new Map();
    let webSearchRequestData = new Map();
    let webSearchResultData = new Map();
    let counts = {};
    const requestCountFile = path.join(authManager.qwenDir, 'request_counts.json');
    
    try {
      const data = await fs.readFile(requestCountFile, 'utf8');
      counts = JSON.parse(data);
      
      // Load token usage data
      if (counts.tokenUsage) {
        for (const [accountId, usageData] of Object.entries(counts.tokenUsage)) {
          tokenUsageData.set(accountId, usageData);
        }
      }
      
      // Load chat request data
      if (counts.requests) {
        for (const [accountId, count] of Object.entries(counts.requests)) {
          chatRequestData.set(accountId, count);
        }
      }
      
      // Load web search request data
      if (counts.webSearchRequests) {
        for (const [accountId, count] of Object.entries(counts.webSearchRequests)) {
          webSearchRequestData.set(accountId, count);
        }
      }
      
      // Load web search result data
      if (counts.webSearchResults) {
        for (const [accountId, count] of Object.entries(counts.webSearchResults)) {
          webSearchResultData.set(accountId, count);
        }
      }
    } catch (error) {
      // File doesn't exist or is invalid
      console.log('No usage data found.');
      return;
    }
    
    if (tokenUsageData.size === 0 && chatRequestData.size === 0 && webSearchRequestData.size === 0) {
      console.log('No usage data available.');
      return;
    }
    
    // Aggregate usage by date across all accounts
    const dailyUsage = new Map();
    const allDates = new Set();
    
    // Process token usage (chat completions)
    for (const [accountId, usageData] of tokenUsageData) {
      for (const entry of usageData) {
        const { date, inputTokens, outputTokens } = entry;
        allDates.add(date);
        
        if (!dailyUsage.has(date)) {
          dailyUsage.set(date, {
            chatRequests: 0,
            inputTokens: 0,
            outputTokens: 0,
            webSearches: 0,
            webResults: 0
          });
        }
        
        const dailyEntry = dailyUsage.get(date);
        dailyEntry.inputTokens += inputTokens;
        dailyEntry.outputTokens += outputTokens;
      }
    }
    
    // Process chat requests
    for (const [accountId, count] of chatRequestData) {
      // For simplicity, assume all requests are from today (since we don't have date breakdown)
      const today = new Date().toISOString().split('T')[0];
      allDates.add(today);
      
      if (!dailyUsage.has(today)) {
        dailyUsage.set(today, {
          chatRequests: 0,
          inputTokens: 0,
          outputTokens: 0,
          webSearches: 0,
          webResults: 0
        });
      }
      
      dailyUsage.get(today).chatRequests += count;
    }
    
    // Process web search requests
    for (const [accountId, count] of webSearchRequestData) {
      const today = new Date().toISOString().split('T')[0];
      allDates.add(today);
      
      if (!dailyUsage.has(today)) {
        dailyUsage.set(today, {
          chatRequests: 0,
          inputTokens: 0,
          outputTokens: 0,
          webSearches: 0,
          webResults: 0
        });
      }
      
      dailyUsage.get(today).webSearches += count;
    }
    
    // Process web search results
    for (const [accountId, count] of webSearchResultData) {
      const today = new Date().toISOString().split('T')[0];
      allDates.add(today);
      
      if (!dailyUsage.has(today)) {
        dailyUsage.set(today, {
          chatRequests: 0,
          inputTokens: 0,
          outputTokens: 0,
          webSearches: 0,
          webResults: 0
        });
      }
      
      dailyUsage.get(today).webResults += count;
    }
    
    if (dailyUsage.size === 0) {
      console.log('No usage data available.');
      return;
    }
    
    // Convert map to array and sort by date
    const sortedDailyUsage = Array.from(dailyUsage.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    // Create table for daily usage
    const table = new Table({
      head: ['Date', 'Chat Req', 'Input Tokens', 'Output Tokens', 'Web Search', 'Web Results'],
      colWidths: [12, 10, 15, 16, 12, 13],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    });
    
    let totalChatRequests = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalWebSearches = 0;
    let totalWebResults = 0;
    
    for (const [date, usage] of sortedDailyUsage) {
      const { chatRequests, inputTokens, outputTokens, webSearches, webResults } = usage;
      
      table.push([
        date,
        chatRequests.toLocaleString(),
        inputTokens.toLocaleString(),
        outputTokens.toLocaleString(),
        webSearches.toLocaleString(),
        webResults.toLocaleString()
      ]);
      
      totalChatRequests += chatRequests;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalWebSearches += webSearches;
      totalWebResults += webResults;
    }
    
    // Add totals row
    table.push([
      { content: 'TOTAL', colSpan: 1, hAlign: 'right' },
      totalChatRequests.toLocaleString(),
      totalInputTokens.toLocaleString(),
      totalOutputTokens.toLocaleString(),
      totalWebSearches.toLocaleString(),
      totalWebResults.toLocaleString()
    ]);
    
    console.log(table.toString());
    console.log('');
    
    // Show overall summary
    console.log('📈 Summary:');
    console.log(`• Total Chat Requests: ${totalChatRequests.toLocaleString()}`);
    console.log(`• Total Web Searches: ${totalWebSearches.toLocaleString()}`);
    console.log(`• Total Input Tokens: ${totalInputTokens.toLocaleString()}`);
    console.log(`• Total Output Tokens: ${totalOutputTokens.toLocaleString()}`);
    const totalTokens = totalInputTokens + totalOutputTokens;
    console.log(`• Total Tokens: ${totalTokens.toLocaleString()}`);
    
  } catch (error) {
    console.error('Failed to show usage report:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
  console.log('Usage: npm run usage');
  console.log('Display daily usage statistics for chat completions and web search.');
  process.exit(0);
}

showUsageReport();