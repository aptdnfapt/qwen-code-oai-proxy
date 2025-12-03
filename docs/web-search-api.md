# Web Search API

## Overview

The Qwen OpenAI Proxy includes a web search API that allows you to search the web using Qwen's search infrastructure. This provides access to up-to-date information from the internet, perfect for queries that require current data beyond the training cutoff.

## API Endpoint

```
POST /v1/web/search
```

## Request Format

```json
{
  "query": "search query here",
  "page": 1,
  "rows": 10
}
```

### Parameters

- **`query`** (string, required): The search query
- **`page`** (integer, optional): Page number for pagination (default: 1)
- **`rows`** (integer, optional): Number of results per page (default: 10, max: 100)

### Example Request

```bash
curl -X POST http://localhost:8080/v1/web/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "query": "latest AI developments",
    "page": 1,
    "rows": 5
  }'
```

## Response Format

```json
{
  "headers": {
    "__d_head_rtm": "1764782975389",
    "__d_head_sip": "192.168.132.54",
    "__d_head_engine_rt": "q:302-s:1697-r:93",
    "__d_head_ver": "0.0.5-1764654997396"
  },
  "data": {
    "total": 26,
    "totalDistinct": 26,
    "docs": [
      {
        "_id": "google-3",
        "_score": 0.6880021095275879,
        "title": "Bitcoin price today - BTC price chart & live trends",
        "url": "https://www.kraken.com/prices/bitcoin",
        "snippet": "Bitcoin price today is $92,522.00. In the last 24 hours Bitcoin's price moved +1.76%.",
        "hostname": "www.kraken.com",
        "timestamp": 0,
        "timestamp_format": ""
      }
    ],
    "qpInfos": [
      {
        "query": "latest AI developments",
        "cleanQuery": null,
        "sensitive": false,
        "spellchecked": null,
        "rewrite": null,
        "multiQuery": ["latest AI developments 2023", "AI breakthroughs 2023", "new AI technology 2023"]
      }
    ]
  },
  "success": true,
  "rid": "e6f8df87-dab9-91b7-8f6f-047152a22966",
  "message": "success",
  "status": 0
}
```

### Response Fields

- **`data.total`**: Total number of results found
- **`data.docs`**: Array of search results
  - **`title`**: Page title
  - **`url`**: Page URL
  - **`snippet`**: Content snippet/description
  - **`hostname`**: Website hostname
  - **`_score`**: Relevance score
- **`data.qpInfos`**: Query processing information
  - **`multiQuery`**: Automatic query expansions performed by the search engine

## Direct Qwen Web Search API

If you want to make requests directly to Qwen's web search API (bypassing the proxy), you can use:

### Endpoint
```
POST https://portal.qwen.ai/api/v1/indices/plugin/web_search
```

### Authentication
Use the same OAuth access token as the chat completion API:
```bash
curl -X POST https://portal.qwen.ai/api/v1/indices/plugin/web_search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_QWEN_OAUTH_TOKEN" \
  -d '{
    "uq": "bitcoin price",
    "page": 1,
    "rows": 10
  }'
```

### Direct API Differences

| Field | Proxy API | Direct Qwen API |
|-------|-----------|-----------------|
| Query field | `query` | `uq` |
| Authentication | API Key or OAuth | OAuth token only |
| Base URL | `http://localhost:8080/v1/web/search` | `https://portal.qwen.ai/api/v1/indices/plugin/web_search` |

### URL Structure Differences

**Important**: Web search and chat completion use different API structures:

- **Chat Completion**: `https://portal.qwen.ai/v1/chat/completions`
  - Uses OpenAI-compatible `/v1/` structure
  
- **Web Search**: `https://portal.qwen.ai/api/v1/indices/plugin/web_search`
  - Uses Qwen's internal plugin API structure
  - **No `/v1/` in the base URL** - it's built into the path

This is why the proxy constructs URLs differently for each endpoint type.

## Rate Limits and Quotas

### Free Account Limits
- **Web Search**: 2,000 requests per day
- **Chat Completions**: Separate quota (varies by model)

### Rate Limiting Behavior
- When limits are exceeded, the API will return appropriate error responses
- The proxy automatically handles account rotation for multi-account setups
- Failed accounts are temporarily marked to prevent repeated failures

### Multi-Account Support
The proxy supports multiple Qwen accounts for web search:
- Automatic rotation between accounts when limits are reached
- Failed account handling with automatic recovery
- Per-account request tracking

## Usage Examples

### Basic Search
```bash
curl -X POST http://localhost:8080/v1/web/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"query": "python programming tutorial"}'
```

### Paginated Results
```bash
curl -X POST http://localhost:8080/v1/web/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "query": "machine learning",
    "page": 2,
    "rows": 5
  }'
```

### Using with Specific Account
```bash
curl -X POST http://localhost:8080/v1/web/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "X-Qwen-Account: my-account" \
  -d '{"query": "climate change news"}'
```

## Integration with Chat Completions

The web search API can be used alongside chat completions to provide up-to-date information:

1. **Search**: Use `/v1/web/search` to get current information
2. **Context**: Include relevant search results in chat completion messages
3. **Response**: Get AI responses based on current web data

### Example Workflow
```javascript
// 1. Search for current information
const searchResults = await fetch('/v1/web/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'latest bitcoin price' })
});

// 2. Use results in chat completion
const chatResponse = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'qwen3-coder-plus',
    messages: [
      {
        role: 'user',
        content: `Based on this current data: ${JSON.stringify(searchResults.data.docs)}, what's your analysis of bitcoin's current position?`
      }
    ]
  })
});
```

## Error Handling

### Common Error Responses

#### Rate Limit Exceeded
```json
{
  "error": {
    "message": "Free allocated quota exceeded",
    "type": "quota_exceeded",
    "code": 429
  }
}
```

#### Invalid Query
```json
{
  "error": {
    "message": "Query parameter is required",
    "type": "invalid_request",
    "code": 400
  }
}
```

#### Authentication Error
```json
{
  "error": {
    "message": "Invalid or missing API key",
    "type": "authentication_error",
    "code": 401
  }
}
```

## Features

### Automatic Query Expansion
The search engine automatically expands queries to provide more comprehensive results:
- "bitcoin price" → ["bitcoin price", "current bitcoin price 2023", "latest bitcoin price", "bitcoin price history"]

### Multi-Source Search
Results are aggregated from multiple sources including:
- Google Search
- News websites
- Technical documentation
- Academic sources

### Real-Time Results
Search results reflect current web content, making it ideal for:
- News and current events
- Price information
- Recent developments
- Trend analysis

## Configuration

The web search API inherits the same configuration as the main proxy:
- Authentication via OAuth tokens
- Multi-account support
- Rate limiting and quota management
- Error handling and retry logic

## Files Involved

- **`src/qwen/api.js`**: Contains the `webSearch()` method
- **`src/index.js`**: Route handler for `/v1/web/search`
- **Authentication**: Same OAuth system as chat completions
- **Rate Limiting**: Per-account tracking with automatic rotation

This web search API provides seamless integration with Qwen's search capabilities while maintaining the same authentication and account management patterns as the chat completion API.