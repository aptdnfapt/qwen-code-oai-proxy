#!/usr/bin/env node

const { QwenAuthManager } = require('./src/qwen/auth.js');
const path = require('path');
const { promises: fs } = require('fs');
const Table = require('cli-table3');

async function showTokenUsage() {
  console.log('📊 Qwen Token Usage Report');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');
  
  try {
    const authManager = new QwenAuthManager();
    
    // Load token usage data from persisted file
    let tokenUsageData = new Map();
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
    } catch (error) {
      // File doesn't exist or is invalid
      console.log('No token usage data found.');
      return;
    }
    
    if (tokenUsageData.size === 0) {
      console.log('No token usage data available.');
      return;
    }
    
    // Aggregate token usage by date across all accounts
    const dailyUsage = new Map();
    
    for (const [accountId, usageData] of tokenUsageData) {
      for (const entry of usageData) {
        const { date, inputTokens, outputTokens } = entry;
        
        if (!dailyUsage.has(date)) {
          dailyUsage.set(date, { inputTokens: 0, outputTokens: 0 });
        }
        
        const dailyEntry = dailyUsage.get(date);
        dailyEntry.inputTokens += inputTokens;
        dailyEntry.outputTokens += outputTokens;
      }
    }
    
    if (dailyUsage.size === 0) {
      console.log('No token usage data available.');
      return;
    }
    
    // Convert map to array and sort by date
    const sortedDailyUsage = Array.from(dailyUsage.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    // Create table for daily usage
    const table = new Table({
      head: ['Date', 'Input Tokens', 'Output Tokens', 'Total Tokens'],
      colWidths: [12, 15, 16, 15],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    });
    
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    for (const [date, usage] of sortedDailyUsage) {
      const { inputTokens, outputTokens } = usage;
      const totalTokens = inputTokens + outputTokens;
      
      table.push([
        date,
        inputTokens.toLocaleString(),
        outputTokens.toLocaleString(),
        totalTokens.toLocaleString()
      ]);
      
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
    }
    
    // Add totals row
    const totalTokens = totalInputTokens + totalOutputTokens;
    table.push([
      { content: 'TOTAL', colSpan: 1, hAlign: 'right' },
      totalInputTokens.toLocaleString(),
      totalOutputTokens.toLocaleString(),
      totalTokens.toLocaleString()
    ]);
    
    console.log(table.toString());
    console.log('');
    
    // Show overall totals
    let totalRequests = 0;
    if (counts.requests) {
      for (const count of Object.values(counts.requests)) {
        totalRequests += count;
      }
    }
    
    console.log(`Total Requests: ${totalRequests.toLocaleString()}`);
    
  } catch (error) {
    console.error('Failed to show token usage:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
  console.log('Usage: npm run auth:tokens');
  console.log('Display daily token usage statistics for all Qwen accounts.');
  process.exit(0);
}

showTokenUsage();