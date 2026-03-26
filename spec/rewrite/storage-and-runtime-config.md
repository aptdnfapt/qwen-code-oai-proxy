# Storage and Runtime Config Spec

## Goal

Use stable application storage for packaged installs, while still allowing local-development flexibility and env-var overrides.

## Default Storage Base

Default packaged-app base directory:

- `~/.local/share/qwen-proxy`

This is the default home for runtime-managed app data.

## Default Directory Layout

```text
~/.local/share/qwen-proxy/
  config.json
  state.json
  log/
    error.log
    error-*.log
    req-<requestId>/
      client-request.json
      upstream-request.json
      response.json
      error.json
```

## Dev vs Packaged Defaults

### Packaged / production default

- logs default to `~/.local/share/qwen-proxy/log`
- runtime config defaults to `~/.local/share/qwen-proxy`

### Local development default

To support current repo-based workflows, local development may keep using repo-local logs.

Recommended dev default:

- repo-local logs: `./log`

Runtime settings still prefer stable app storage unless explicitly overridden.

## Auth Storage Rule

The rewrite does **not** need to migrate auth credentials immediately.

Initial compatibility rule:

- keep existing auth credential behavior first
- only migrate later if explicitly approved

## Environment Variable Overrides

These env vars should be supported by the rewritten app.

### Directory overrides

- `QWEN_PROXY_HOME`
  - overrides the base app-data directory
- `QWEN_PROXY_CONFIG_DIR`
  - overrides where runtime config/state live
- `QWEN_PROXY_LOG_DIR`
  - overrides the log directory

### Runtime defaults

- `LOG_LEVEL`
  - startup default log level if no persisted runtime override exists
- existing env vars for host/port/model/auth should continue to work unless intentionally redesigned with compatibility notes

## Precedence Rules

### For path resolution

1. explicit CLI flag if supported later
2. env var override
3. mode-specific default

### For runtime log level

1. explicit CLI flag if supported later
2. persisted runtime override in app config
3. `LOG_LEVEL` env var
4. hardcoded fallback

This keeps operator runtime changes sticky while still allowing first-boot env configuration.

## Runtime Config Files

### `config.json`

Purpose:

- operator-chosen runtime settings

Expected examples:

- current log level
- remembered preferred defaults for UI/runtime behavior

### `state.json`

Purpose:

- transient but useful app state

Expected examples:

- last active TUI tab
- last selected filters
- last viewed panel state

## Compatibility Rules for Logs

Regardless of storage path, preserve these file names:

- `error.log`
- `error-*.log`
- `req-<requestId>/client-request.json`
- `req-<requestId>/upstream-request.json`
- `req-<requestId>/response.json`
- `req-<requestId>/error.json`

This ensures:

- operator familiarity
- easier migration
- easier TUI file browsing

## Packaging Notes

Because the app is expected to become one npm-installed command, storage must not depend on current working directory in packaged mode.

That is why packaged defaults use stable app-data paths rather than repo-local folders.

## Acceptance Rules

This area is complete when:

- packaged installs use stable global storage by default
- local development can still use repo-local logs when desired
- env vars can override log/config locations
- runtime log level persists across restarts
