# Logging and Debugging Spec

## Status

This is a high-priority spec area.

Logging is not a side detail in this project.
It is a product feature.

## NON-NEGOTIABLES

### 1. Preserve the live log language

The current live log feel must remain.

Examples of the style to preserve:

```text
→ [default] a1b2c3d4 | qwen3-coder-plus {streaming} | 302 tokens #14
← [default] a1b2c3d4 200 | 1320ms | 120+88 tok | qwen: 9f8e7d6c
✗ [auth] 500 | Missing device_code or code_verifier
↻ Refresh | acc-2 | ok
● Server | http://127.0.0.1:38471
```

The exact internals may change.
The operator-visible style should not.

### 2. Preserve the `error.log` block shape

The current `error.log` should keep the same text-block feel.

Expected structure:

```text
[timestamp] STATUS=500 ACCOUNT=default REQUEST_ID=req-...
Error: ...
Response:
...
Details: ...
================================================================================
```

### 3. Preserve per-request debug log layout

Current layout to preserve:

```text
log/
  error.log
  error-*.log
  req-<requestId>/
    client-request.json
    upstream-request.json
    response.json
    error.json
```

## Logging Architecture Direction

### Replace split logging internals with one central service

Current code has logging spread across:

- `src/utils/liveLogger.js`
- `src/utils/fileLogger.js`
- `src/utils/logger.js`

Rewrite target:

- one typed logging service behind clear interfaces

Outputs still remain distinct:

- live event stream
- `error.log`
- request debug folders/files

### Important rule

**Internal rewrite is allowed. Visible style drift is not allowed.**

## Runtime Log Levels

Supported runtime levels:

- `off`
- `error`
- `error-debug`
- `debug`

## Runtime Log Level Change Rules

### Operator behavior

The user must be able to change log level while the app is running.

From:

- Server tab
- Logs tab quick controls

### Effect timing

- new requests use the new level immediately
- live event stream updates immediately
- in-flight requests may finish using the level they started with if needed for consistency

That rule avoids partial mixed request-log artifacts.

### Persistence

The selected runtime log level should be saved in runtime config storage.

Default behavior:

- first boot uses env/default resolution
- after operator change, the chosen runtime setting is persisted

## TUI Logging UX

## Main Logs Screen

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Logs                                                                         level: debug   │
├──────────────┬──────────────┬──────────────┬────────────────────────────────────────────────┤
│ Live         │ Errors       │ Requests     │ search: [ req-19a2...              ]          │
├──────────────┴──────────────┴──────────────┴────────────────────────────────────────────────┤
│ filters: [all] [info] [warn] [error]   account:[all]   route:[all]   follow:[on]          │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ live list / log console                      │ detail pane                                   │
│                                              │ selected error or request details             │
│                                              │ input / transformer / output / error          │
│                                              │ file views                                    │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ P pause/resume   C clear view   Enter inspect   Tab switch pane                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Logs sub-views

#### Live

- full log console feel
- filters by level/account/route
- pause/follow controls

#### Errors

- parse and display `error.log`
- left pane: entry list
- right pane: full selected block
- quick jump to related request logs

#### Requests

- browse request directories
- show metadata list
- show file views for:
  - input
  - transformer
  - output
  - error

## Server Tab Logging Controls

The Server tab owns runtime controls.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Server                                                                                       │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ Runtime Status                               │ Runtime Controls                              │
│ State: RUNNING ●                             │ [ Stop Server ] [ Restart ]                  │
│ Host: 127.0.0.1                              │ Log Level                                    │
│ Port: 38471                                  │ [ off ] [ error ] [ error-debug ] [ debug ]  │
│ Active req: 2                                │ [ Apply Now ] [ Save As Default ]            │
│ Streams: 1                                   │ [ open error.log ] [ open req logs ]         │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ runtime log-level changes affect new requests immediately                                   │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Metadata Index for the TUI

To avoid heavy file rescans on every render, the rewrite should maintain an in-memory and/or lightweight persisted index for request/error metadata.

Suggested indexed fields:

- request id
- timestamp
- route
- account
- status
- latency
- file paths

The file outputs stay the source of truth for deep inspection.
The index exists to make the UI fast.

## Compatibility Rules

If future logging improvements are added:

- never silently remove the classic live log format
- never silently replace `error.log` with JSON-only output
- never hide request log files behind UI-only storage

The UI is a better viewer, not a replacement for the underlying logs.
