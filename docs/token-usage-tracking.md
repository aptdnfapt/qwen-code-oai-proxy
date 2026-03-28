# Token Usage Tracking

## Overview

The Qwen OpenAI Proxy tracks daily usage in the shared `~/.qwen/request_counts.json` runtime file.

It now tracks not only input/output tokens, but also cache reads, cache writes, and cache type labels used by the TUI Usage screen.

## Features

- **Daily Request + Token Tracking**: Records request count, input tokens, and output tokens per day
- **Multi-Account Support**: Aggregates token usage across all configured accounts
- **Streaming & Regular Requests**: Tracks usage from both streaming and non-streaming API responses
- **Cache Metrics**: Records cache read tokens, cache write/create tokens, and cache type labels
- **Persistent Storage**: Token usage data is stored locally in `~/.qwen/request_counts.json`
- **TUI Usage Screen**: Rezi Usage screen reads the same runtime data shape for summary + table views

## How It Works

### Data Collection
1. **Regular Requests**: usage is extracted from the upstream `usage` field
2. **Streaming Requests**: usage is extracted from streamed SSE chunks that include final `usage`
3. **Cache Fields**: cache metrics are read from `usage.prompt_tokens_details`
4. **Daily Aggregation**: usage is grouped by date and account

### Data Storage
Usage data is stored in the existing `request_counts.json` file alongside request counts:
```json
{
  "lastResetDate": "2026-03-28",
  "requests": {
    "default": 45
  },
  "tokenUsage": {
    "default": [
      {
        "date": "2026-03-28",
        "requests": 45,
        "requestsKnown": true,
        "inputTokens": 12500,
        "outputTokens": 8300,
        "cacheReadTokens": 6400,
        "cacheWriteTokens": 1800,
        "cacheTypes": ["ephemeral"]
      }
    ]
  }
}
```

## Usage

### View Token Usage Report

You can use either of these commands to view token usage reports:

```bash
npm run auth:tokens
```

or

```bash
npm run tokens
```

Both commands display a terminal report showing:
- daily request counts
- daily input/output tokens
- web search counts

The TUI Usage screen additionally shows:
- cache read tokens
- cache write/create tokens
- cache type label
- derived cache hit rate

### Cache Source Fields

Cache metrics come from real upstream usage payloads:

- `usage.prompt_tokens_details.cached_tokens`
- `usage.prompt_tokens_details.cache_creation_input_tokens`
- `usage.prompt_tokens_details.cache_creation.*`
- `usage.prompt_tokens_details.cache_type`

### Example TUI Meaning

- `cache read` --> tokens served from cache
- `cache write` --> tokens written/created for cache
- `cache hit` --> `cache_read / (cache_read + cache_write)`
- `cache type` --> upstream label like `ephemeral`, or `mixed` when multiple types appear in a day

### Example Output
```
📊 Qwen Token Usage Report
═══════════════════════════════════════════════════════════════════════════════

┌────────────┬───────────────┬────────────────┬───────────────┐
│ Date       │ Input Tokens  │ Output Tokens  │ Total Tokens  │
├────────────┼───────────────┼────────────────┼───────────────┤
│ 2025-08-20 │ 12,500        │ 8,300          │ 20,800        │
│ 2025-08-21 │ 15,200        │ 9,100          │ 24,300        │
│ 2025-08-22 │ 8,750         │ 5,400          │ 14,150        │
├────────────┼───────────────┼────────────────┼───────────────┤
│ TOTAL      │ 36,450        │ 22,800         │ 59,250        │
└────────────┴───────────────┴────────────────┴───────────────┘

Total Requests: 127
```

## Technical Implementation

### Core Components
- **`src/qwen/api.ts`** --> records request + token + cache metrics
- **`src/tui/helpers/runtime.ts`** --> aggregates daily usage for the TUI
- **`src/tui/screens/usage.ts`** --> renders summary, filter, and usage table
- **`usage.ts`** --> terminal usage report script

### Key Methods
- `recordTokenUsage(accountId, usage)` --> records prompt/completion/cache usage
- `extractUsageFromSseText(...)` --> extracts final usage from streaming chunks
- `loadRequestCounts()` / `saveRequestCounts()` --> handles persistent storage
- `aggregateUsageDays(...)` --> combines daily usage across accounts for the TUI

## Dependencies
- `cli-table3`: Terminal table formatting (automatically installed)

## Data Privacy
All token usage data is stored locally and never transmitted externally. The system only tracks usage statistics for your own monitoring and budgeting purposes.
