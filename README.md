# qwen-proxy — OpenAI-Compatible Proxy for Qwen Models

Works with opencode, crush, claude code router, roo code, cline and anything that speaks the OpenAI API. Has tool calling and streaming support.

> **New** — qwen 3.5 plus model (`coder-model`) is now the recommended default

[Discord](https://discord.gg/6S7HwCxbMy)

**Important:** Users may hit 504 / timeout errors at 130k–150k+ token contexts — this is a Qwen upstream limit.

For a serverless/edge alternative: [qwen-worker-proxy](https://github.com/aptdnfapt/qwen-worker-proxy)

---

## Quick Start

### Option 1: npm (global install)

```bash
npm install -g qwen-proxy
```

Add an account:
```bash
qwen-proxy auth add myaccount
```

Start with TUI dashboard:
```bash
qwen-proxy serve
```

Or headless (background/server mode):
```bash
qwen-proxy serve --headless
```

Point your client at `http://localhost:8080/v1`. API key can be any string.

---

### Option 2: Docker (recommended for self-hosting)

```bash
git clone https://github.com/aptdnfapt/qwen-code-oai-proxy
cd qwen-code-oai-proxy
cp .env.example .env
docker compose up -d
```

The container mounts `~/.qwen` from your host — accounts you add are picked up live by the running container **without a restart**.

Add an account while the container is running:
```bash
docker compose exec qwen-proxy node dist/src/cli/qwen-proxy.js auth add myaccount
```

Point your client at `http://localhost:8080/v1`.

---

### Option 3: Local / Dev

```bash
npm install
npm run auth:add myaccount
qwen-proxy serve
# or headless:
npm run serve:headless
```

---

## CLI Commands

```bash
qwen-proxy serve                  # TUI dashboard
qwen-proxy serve --headless       # headless server

qwen-proxy auth list
qwen-proxy auth add <account-id>
qwen-proxy auth remove <account-id>
qwen-proxy auth counts
qwen-proxy usage
```

---

## Dev Test Helpers

For fresh-machine regressions, use the built-in clean-home checks instead of ad-hoc shell probes:

```bash
npm run test:auth-clean-home
npm run test:first-run
npm run test:install-smoke
```

These scripts run the compiled code with a temporary `HOME`, so they simulate a new machine without touching your real `~/.qwen` or local usage database.

More detail: `docs/testing-clean-home.md`

---

## Multi-Account Support

Add multiple accounts — requests round-robin across all of them automatically:

```bash
qwen-proxy auth add account1
qwen-proxy auth add account2
qwen-proxy auth add account3
```

**How rotation works:**
- Requests rotate round-robin across all valid accounts
- Tokens refreshed ahead of expiry automatically
- Auth failures → one refresh attempt → rotate to next account
- Transient failures (429, 500, timeout) → rotate to next account, no cooldowns
- Client errors (bad payload etc.) → returned immediately, no rotation
- `DEFAULT_ACCOUNT` env var → that account is tried first
- Request counts reset daily at UTC midnight

**For Docker:**
```bash
docker compose exec qwen-proxy node dist/src/cli/qwen-proxy.js auth list
docker compose exec qwen-proxy node dist/src/cli/qwen-proxy.js auth add <account-id>
docker compose exec qwen-proxy node dist/src/cli/qwen-proxy.js auth remove <account-id>
```

---

## Supported Models

| Model ID | Description | Max Tokens | Notes |
|----------|-------------|------------|-------|
| `coder-model` | **Recommended** — Qwen 3.5 Plus, best for coding | 65536 | Default, excellent for code tasks |
| `qwen3-coder-plus` | Qwen 3 Coder Plus | 65536 | |
| `qwen3-coder-flash` | Qwen 3 Coder Flash | 65536 | Faster, lighter |
| `vision-model` | Multimodal with image support | 32768 | Lower token limit, auto-clamped |
| `qwen3.5-plus` | Alias → resolves to `coder-model` | 65536 | |

---

## Supported Endpoints

- `POST /v1/chat/completions` — Chat completions (streaming + non-streaming)
- `GET /v1/models` — List available models
- `POST /v1/web/search` — Web search (2000 req/day free)
- `GET/POST /mcp` — MCP server (SSE transport)
- `GET /health` — Health check

---

## Example Usage

### JavaScript / Node.js
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'fake-key',
  baseURL: 'http://localhost:8080/v1'
});

const response = await openai.chat.completions.create({
  model: 'coder-model',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.choices[0].message.content);
```

### curl
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-key" \
  -d '{
    "model": "coder-model",
    "messages": [{"role": "user", "content": "Hello!"}],
    "temperature": 0.7,
    "max_tokens": 200
  }'
```

### Streaming
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-key" \
  -d '{
    "model": "coder-model",
    "messages": [{"role": "user", "content": "Explain how to reverse a string in JavaScript."}],
    "stream": true,
    "max_tokens": 300
  }'
```

---

## Web Search API

Free web search — 2000 requests/day on free accounts:

```bash
curl -X POST http://localhost:8080/v1/web/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer fake-key" \
  -d '{"query": "latest AI developments", "page": 1, "rows": 5}'
```

---

## AI Agent Configs

### opencode

Add to `~/.config/opencode/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "qwen": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "proxy",
      "options": {
        "baseURL": "http://localhost:8080/v1"
      },
      "models": {
        "coder-model": {
          "name": "qwen35"
        }
      }
    }
  }
}
```

### crush

Add to `~/.config/crush/crush.json`:
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
          "id": "coder-model",
          "name": "coder-model",
          "cost_per_1m_in": 0.0,
          "cost_per_1m_out": 0.0,
          "cost_per_1m_in_cached": 0,
          "cost_per_1m_out_cached": 0,
          "context_window": 150000,
          "default_max_tokens": 32768
        }
      ]
    }
  }
}
```

### Claude Code Router
```json
{
  "LOG": false,
  "Providers": [
    {
      "name": "qwen-code",
      "api_base_url": "http://localhost:8080/v1/chat/completions/",
      "api_key": "any-string",
      "models": ["coder-model"],
      "transformer": {
        "use": [
          ["maxtoken", {"max_tokens": 32768}],
          "enhancetool",
          "cleancache"
        ]
      }
    }
  ],
  "Router": {
    "default": "qwen-code,coder-model"
  }
}
```

### Roo Code / Kilo Code / Cline

1. Go to settings → choose OpenAI Compatible
2. Set URL: `http://localhost:8080/v1`
3. API key: any random string
4. Model: `coder-model`
5. Disable streaming checkbox (Roo Code / Kilo Code)
6. Max output: `32000`
7. Context window: up to 300k (but past 150k gets slower)

### MCP (web search tool)

Add to `~/.config/opencode/config.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "qwen-web-search": {
      "type": "remote",
      "url": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

Omit `headers` if you have no API key set. Works with other MCP clients too.

---

## API Key Authentication

```bash
# Single key
API_KEY=your-secret-key

# Multiple keys
API_KEY=key1,key2,key3
```

Supported headers:
- `Authorization: Bearer your-secret-key`
- `X-API-Key: your-secret-key`

If no API key is configured, no auth is required.

---

## Configuration

Set via environment variables or `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `HOST` | `localhost` | Bind address (`0.0.0.0` for Docker) |
| `API_KEY` | — | Comma-separated auth keys |
| `DEFAULT_ACCOUNT` | — | Account to prefer first |
| `LOG_LEVEL` | `error-debug` | `off` / `error` / `error-debug` / `debug` |
| `MAX_DEBUG_LOGS` | `20` | Max request debug dirs to keep |
| `QWEN_PROXY_HOME` | `~/.local/share/qwen-proxy` | Override runtime data dir |
| `QWEN_PROXY_LOG_DIR` | — | Override log dir |

Compatibility aliases: `DEBUG_LOG=true` → `LOG_LEVEL=debug`, `LOG_FILE_LIMIT` → `MAX_DEBUG_LOGS`

Example `.env`:
```bash
LOG_LEVEL=debug
MAX_DEBUG_LOGS=10
API_KEY=your-secret-key
DEFAULT_ACCOUNT=my-primary-account
```

Port and host can also be changed from the TUI Settings screen and are saved to `config.json` automatically.

---

## Storage

| Path | Contents |
|------|----------|
| `~/.qwen/oauth_creds_<id>.json` | Account credentials |
| `~/.local/share/qwen-proxy/usage.db` | Request + token usage (SQLite) |
| `~/.local/share/qwen-proxy/config.json` | Port, host, log level, auto-start |
| `~/.local/share/qwen-proxy/log/` | Error logs |

---

## Health Check

```bash
curl http://localhost:8080/health
```

Returns server status, account validation, token expiry info, request counts.

---

## Usage Tracking

```bash
qwen-proxy usage
# or
npm run usage
npm run tokens
```

Shows daily token usage, cache hits, request counts per account. Also visible in the TUI Usage screen.

---

## Runtime Log Level

Change live without restart:
```bash
# inspect
GET /runtime/log-level

# change
POST /runtime/log-level
{"level": "debug"}

# change without persisting
POST /runtime/log-level
{"level": "error", "persist": false}
```
