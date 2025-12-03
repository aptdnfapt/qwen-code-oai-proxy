# Qwen OpenAI-Compatible Proxy Server - Works with opencode, crush, claude code router, roo code, cline mostly everything

A proxy server that exposes Qwen models through an OpenAI-compatible API endpoint. Has tool calling and streaming support.

## Important Notes

To have a better experience for using it as prod you can use cloud flare worker . check the repo https://github.com/aptdnfapt/qwen-worker-proxy

Users might face errors or 504 Gateway Timeout issues when using contexts with 130,000 to 150,000 tokens or more. This appears to be a practical limit for Qwen models. Qwen code itself tends to also break down and get stuck on this limit.

 [Discord](https://discord.gg/6S7HwCxbMy) server to talk about other stuff . 

## Quick Start

### Option 1: Using Docker (Recommended)

1.  **Configure Environment**:
    ```bash
    cp .env.example .env
    # Edit .env file with your desired configuration
    ```

2.  **Build and Run with Docker Compose**:
    ```bash
    docker-compose up -d
    ```

3.  **Authenticate**:
    ```bash
    docker-compose exec qwen-proxy npm run auth:add <account>
    ```

4.  **Use the Proxy**: Point your OpenAI-compatible client to `http://localhost:8080/v1`

### Option 2: Local Development

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Authenticate**: You need to authenticate with Qwen to generate the required credentials file.
    *   Run `npm run auth:add <account>` to authenticate with your Qwen account
    *   This will create the `~/.qwen/oauth_creds.json` file needed by the proxy server
    *   Alternatively, you can use the official `qwen-code` CLI tool from [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code)
3.  **Start the Server**:
    ```bash
    npm start
    ```
4.  **Use the Proxy**: Point your OpenAI-compatible client to `http://localhost:8080/v1`.

**Note**: API key can be any random string - it doesn't matter for this proxy.

## Multi-Account Support

The proxy supports multiple Qwen accounts to overcome the 2,000 requests per day limit per account. Accounts are automatically rotated when quota limits are reached.

### Setting Up Multiple Accounts

**For Docker:**
```bash
docker-compose exec qwen-proxy npm run auth:list
docker-compose exec qwen-proxy npm run auth:add <account-id>
docker-compose exec qwen-proxy npm run auth:remove <account-id>
```

**For Local Development:**
1. List existing accounts:
   ```bash
   npm run auth:list
   ```

2. Add a new account:
   ```bash
   npm run auth:add <account-id>
   ```
   Replace `<account-id>` with a unique identifier for your account (e.g., `account2`, `team-account`, etc.)

3. Remove an account:
   ```bash
   npm run auth:remove <account-id>
   ```

### How Account Rotation Works

- When you have multiple accounts configured, the proxy will automatically rotate between them
- Each account has a 2,000 request per day limit
- When an account reaches its limit, Qwen's API will return a quota exceeded error
- The proxy detects these quota errors and automatically switches to the next available account
- If a DEFAULT_ACCOUNT is configured, the proxy will use that account first before rotating to others
- Request counts are tracked locally and reset daily at UTC midnight
- You can check request counts for all accounts with:
  ```bash
  npm run auth:counts
  ```

### Usage Tracking

Monitor your API usage with detailed reports:

```bash
# Show comprehensive usage report (chat + web search)
npm run usage
```

### Account Usage Monitoring

The proxy provides real-time feedback in the terminal:
- Shows which account is being used for each request
- Displays current request count for each account
- Notifies when an account is rotated due to quota limits
- Indicates which account will be tried next during rotation
- Shows which account is configured as the default account on server startup
- Marks the default account in the account list display

## API Key Authentication

The proxy can be secured with API keys to prevent unauthorized access.

### Setting up API Keys

1. **Single API Key:**
   ```bash
   API_KEY=your-secret-key-here
   ```

2. **Multiple API Keys:**
   ```bash
   API_KEY=key1,key2,key3
   ```

3. **Using the Proxy:**
   ```javascript
   const openai = new OpenAI({
     apiKey: 'your-secret-key-here',
     baseURL: 'http://localhost:8080/v1'
   });
   ```

**Headers Supported:**
- `X-API-Key: your-secret-key`
- `Authorization: Bearer your-secret-key`

If no API key is configured, the proxy will not require authentication.

## Health Check

Monitor the proxy status with the health endpoint:

```bash
curl http://localhost:8080/health
```

Response includes:
- Server status
- Account validation status  
- Token expiry information
- Request counts

## Configuration

The proxy server can be configured using environment variables. Create a `.env` file in the project root or set the variables directly in your environment.

*   `LOG_FILE_LIMIT`: Maximum number of debug log files to keep (default: 20)
*   `DEBUG_LOG`: Set to `true` to enable debug logging (default: false)
*   `API_KEY`: Set API key(s) for authentication (comma-separated for multiple keys)
*   `DEFAULT_ACCOUNT`: Specify which account the proxy should use by default (when using multi-account setup)
    *   Should match the name used when adding an account with `npm run auth add <name>`
    *   If not set or invalid, the proxy will use the first available account

Example `.env` file:
```bash
# Keep only the 10 most recent log files
LOG_FILE_LIMIT=10

# Enable debug logging (log files will be created)
DEBUG_LOG=true

# API key for authentication (comma-separated for multiple keys)
API_KEY=your-secret-key-here

# Specify which account to use by default (when using multi-account setup)
# Should match the name used when adding an account with 'npm run auth add <name>'
DEFAULT_ACCOUNT=my-primary-account
```

## Example Usage

### Using JavaScript/Node.js:
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'fake-key', // Not used, but required by the OpenAI client
  baseURL: 'http://localhost:8080/v1'
});

async function main() {
  const response = await openai.chat.completions.create({
    model: 'qwen-coder-plus',
    messages: [
      { "role": "user", "content": "Hello!" }
    ]
  });

  console.log(response.choices[0].message.content);
}

main();
```

### Using curl:
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-key" \
  -d '{
    "model": "qwen3-coder-plus",
    "messages": [
      {
        "role": "user",
        "content": "Hello! Can you help me write a simple JavaScript function that adds two numbers together?"
      }
    ],
    "temperature": 0.7,
    "max_tokens": 200
  }'
```

### Testing with streaming response:
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-key" \
  -d '{
    "model": "qwen3-coder-plus",
    "messages": [
      {
        "role": "user",
        "content": "Explain how to reverse a string in JavaScript."
      }
    ],
    "stream": true,
    "temperature": 0.7,
    "max_tokens": 300
  }'
```

## Supported Models

The proxy supports the following Qwen models:

*   `qwen3-coder-plus` - Primary coding model with enhanced capabilities
*   `qwen3-coder-flash` - Faster, lighter coding model for quick responses
*   `vision-model` - Multimodal model with image processing capabilities

**Note**: Use the exact model name as shown above when configuring your client applications.

## Supported Endpoints

*   `POST /v1/chat/completions` - Chat completions (streaming and non-streaming)
*   `POST /v1/web/search` - Web search for real-time information
*   `GET /v1/models` - List available models
*   `GET /health` - Health check and status

## Web Search API

Free web search endpoint from Qwen - 2000 requests per day for free accounts.

```bash
curl -X POST http://localhost:8080/v1/web/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-key" \
  -d '{
    "query": "latest AI developments",
    "page": 1,
    "rows": 5
  }'
```


## Tool Calling Support

This proxy server supports tool calling functionality, allowing you to use it with tools like opencode and crush roo cline kilo and etc . 

### opencode Configuration

To use with opencode, add the following to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "myprovider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "proxy",
      "options": {
        "baseURL": "http://localhost:8080/v1"
      },
      "models": {
        "qwen3-coder-plus": {
          "name": "qwen3"
        }
      }
    }
  }
}
```



### crush Configuration

To use with crush, add the following to `~/.config/crush/crush.json`:

```json
{
  "$schema": "https://charm.land/crush.json",
  "providers": {
    "proxy": {
      "type": "openai",
      "base_url": "http://localhost:8080/v1",
      "api_key": "",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "cost_per_1m_in": 0.0,
          "cost_per_1m_out": 0.0,
          "cost_per_1m_in_cached": 0,
          "cost_per_1m_out_cached": 0,
          "context_window": 150000,
          "default_max_tokens": 64000
        }
      ]
    }
  }
}
```



### Claude code Router
```json
{
  "LOG": false,
  "Providers": [
    {
      "name": "qwen-code",
      "api_base_url": "http://localhost:8080/v1/chat/completions/",
      "api_key": "wdadwa-random-stuff",
      "models": ["qwen3-coder-plus"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool",
          "cleancache"
        ]
      }
    }
  ],
  "Router": {
    "default": "qwen-code,qwen3-coder-plus"
  }
}
```

### Roo Code and Kilo Code and Cline Configuration

To use with Roo Code or Kilo Code or Cline :

1. Go to settings in the client
2. Choose the OpenAI compatible option
3. Set the URL to: `http://localhost:8080/v1`
4. Use a random API key (it doesn't matter)
5. Type or choose the model name exactly as: `qwen3-coder-plus`
6. Disable streaming in the checkbox for Roo Code or Kilo Code
7. Change the max output setting from -1 to 65000
8. You can change the context window size to around 300k or so but after 150k it gets slower so keep that in mind . 

## Token Counting

The proxy now displays token counts in the terminal for each request, showing both input tokens and API-returned usage statistics (prompt, completion, and total tokens).

## Token Usage Tracking

The proxy includes comprehensive token usage tracking that monitors daily input and output token consumption across all accounts. View detailed token usage reports with either:

```bash
npm run auth:tokens
```

or

```bash
npm run tokens
```

Both commands display a clean table showing daily token usage trends, lifetime totals, and request counts. For more information, see `docs/token-usage-tracking.md`.

For more detailed documentation, see the `docs/` directory.

For information about configuring a default account, see `docs/default-account.md`.

---


