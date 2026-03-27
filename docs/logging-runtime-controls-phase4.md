# Logging + Runtime Controls (Phase 4)

## What changed

- one shared runtime logging service now owns:
  - active log level
  - resolved log directory
  - cleanup/rotation
  - runtime log-level persistence wiring
- live logs and file logs now read the same runtime state
- startup now loads persisted log level before normal server logs begin

## Runtime control endpoints

- `GET /runtime/log-level`
  - returns current log level, persisted log level, log dir, config file path, allowed levels
- `POST /runtime/log-level`
  - body:
    - `level`: `off` | `error` | `error-debug` | `debug`
    - `persist`: optional boolean, defaults to `true`

Example behavior:

- `persist=true` --> apply now + save to runtime config
- `persist=false` --> apply now only for current process

## Persistence rules

Log level precedence now works like this:

1. runtime API change in memory
2. persisted `config.json` value
3. `LOG_LEVEL` env var
4. fallback default

## Log storage rules

- packaged mode default log dir --> `~/.local/share/qwen-proxy/log`
- development mode default log dir --> `./log`
- overrides still work:
  - `QWEN_PROXY_HOME`
  - `QWEN_PROXY_CONFIG_DIR`
  - `QWEN_PROXY_LOG_DIR`

## Compatibility kept

- live log style stays the same --> `→` `←` `✗` `↻` `●`
- `error.log` block style stays the same
- request debug folders still use `req-<id>/...`
- failed debugged requests keep `req-<id>/error.json`
