# Qwen OpenAI-Compatible Proxy Server


A proxy server that exposes Qwen models through an OpenAI-compatible API endpoint. Has tool calling and stream  
Works with opendcode and crush 

## Important Notes

Users might face errors or 504 Gateway Timeout issues when using contexts with 130,000 to 150,000 tokens or more. This appears to be a practical limit for Qwen models. Qwen code it self tends to also break down and get stuck on this limit . 


## Quick Start

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

## Multi-Account Support

The proxy supports multiple Qwen accounts to overcome the 2,000 requests per day limit per account. Accounts are automatically rotated when quota limits are reached.

### Setting Up Multiple Accounts

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
- Request counts are tracked locally and reset daily at UTC midnight
- You can check request counts for all accounts with:
  ```bash
  npm run auth:counts
  ```

### Account Usage Monitoring

The proxy provides real-time feedback in the terminal:
- Shows which account is being used for each request
- Displays current request count for each account
- Notifies when an account is rotated due to quota limits
- Indicates which account will be tried next during rotation

## Configuration

The proxy server can be configured using environment variables. Create a `.env` file in the project root or set the variables directly in your environment.

*   `LOG_FILE_LIMIT`: Maximum number of debug log files to keep (default: 20)
*   `DEBUG_LOG`: Set to `true` to enable debug logging (default: false)
*   `STREAM`: Set to `true` to enable streaming responses (default: false)
    *   **Important**: Set this to `true` when using tools like opencode or crush that require streaming responses

Example `.env` file:
```bash
# Keep only the 10 most recent log files
LOG_FILE_LIMIT=10

# Enable debug logging (log files will be created)
DEBUG_LOG=true

# Enable streaming responses (disabled by default)
# Required for tools like opencode and crush
STREAM=true
```

## Example Usage

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'fake-key', // Not used, but required by the OpenAI client
  baseURL: 'http://localhost:8080/v1'
});

async function main() {
  const response = await openai.chat.completions.create({
    model: 'qwen3-coder-plus',
    messages: [
      { "role": "user", "content": "Hello!" }
    ]
  });

  console.log(response.choices[0].message.content);
}

main();
```

## Supported Endpoints

*   `POST /v1/chat/completions`


## Tool Calling Support

This proxy server supports tool calling functionality, allowing you to use it with tools like opencode and crush.

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

**Note**: For opencode to work properly with streaming responses, you need to enable streaming in the proxy server by setting `STREAM=true` in your `.env` file.

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

**Note**: For crush to work properly with streaming responses, you need to enable streaming in the proxy server by setting `STREAM=true` in your `.env` file.

## Token Counting

The proxy now displays token counts in the terminal for each request, showing both input tokens and API-returned usage statistics (prompt, completion, and total tokens).

For more detailed documentation, see the `docs/` directory.
