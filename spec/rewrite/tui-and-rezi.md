# TUI and Rezi Spec

## Goal

Build a functional operator TUI that feels like a control room for the proxy.

The TUI must help the operator:

- see live activity
- inspect logs and request artifacts
- manage accounts
- review usage
- control the server

## Important Rezi Guidance

### Use these local references during implementation

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/README.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/main.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/screens/shell.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/screens/logs.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/logs-console.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/table.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/virtual-list.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/tabs.md`

### Important caution

Rezi currently marks itself pre-alpha.

Also, `ui.tabs` is useful but not the safest choice for primary app routing.

### Decision

Use route/screen navigation as the primary implementation model.
Make it visually look like top tabs.

That gives:

- safer navigation internals
- easier keyboard wiring
- cleaner control over screen state

## Main TUI Shell

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ qwen-proxy TUI                                                      status: RUNNING  ●     │
│ host: 127.0.0.1   port: 38471   log: error-debug   active acc: default                     │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│ Logs         │ Accounts     │ Usage        │ Server       │ Help         │                 │
├──────────────┴──────────────┴──────────────┴──────────────┴──────────────┴─────────────────┤
│                                                                                              │
│                                   active screen area                                         │
│                                                                                              │
│                                                                                              │
│                                                                                              │
│                                                                                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ F1 Logs   F2 Accounts   F3 Usage   F4 Server   F5 Help   L log level   Q quit              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Screen Set

### 1. Logs

Purpose:

- live operator visibility
- error inspection
- request artifact inspection

Details live in `spec/rewrite/logging-and-debugging.md`.

### 2. Accounts

Purpose:

- view all accounts
- see validity/expiry/counts
- add/remove/refresh accounts
- manage default account behavior if supported

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Accounts                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Add Account ] [ Refresh Selected ] [ Remove Selected ] [ Set Default ]                    │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ ID         status     expires         today  │ selected account details                      │
│ default    valid      18:22 today     82     │                                               │
│ acc-2      valid      20:10 today     144    │                                               │
│ acc-3      expired    --              0      │                                               │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ A add   R refresh   D delete   Enter inspect                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Usage

Purpose:

- inspect token/request usage quickly
- keep summary readable first, fancy charts later

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Usage                                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Today: req 226   input tok 120k   output tok 88k   web 19                                   │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ Date         Chat Req   In Tok   Out Tok     │ selected day/account details                  │
│ 2026-03-24   120        55k      40k         │                                               │
│ 2026-03-25   188        90k      63k         │                                               │
│ 2026-03-26   226        120k     88k         │                                               │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ / search   ↑↓ move   Enter inspect                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4. Server

Purpose:

- runtime status
- runtime controls
- log-level control
- health/config summary

This is the control room tab.

It is not the same as Logs:

- **Logs** = watch activity
- **Server** = control runtime behavior

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Server                                                                                       │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ Runtime Status                               │ Runtime Controls                              │
│ State:        RUNNING ●                      │ [ Stop Server ]  [ Restart ]                 │
│ Host:         127.0.0.1                      │ Log Level                                     │
│ Port:         38471                          │ [ off ] [ error ] [ error-debug ] [ debug ]  │
│ Uptime:       00:21:44                       │ [ Apply Now ] [ Save As Default ]            │
│ Active req:   2                              │ [ open error.log ] [ open req logs ]         │
│ Streams:      1                              │                                               │
│ Last error:   12:04:18                       │                                               │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ Notes: runtime log-level changes affect new requests immediately                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5. Help

Purpose:

- shortcuts
- auth guidance
- common troubleshooting notes
- pointer to paths like log dir and config dir

## Keyboard Plan

Suggested defaults:

- `F1` -> Logs
- `F2` -> Accounts
- `F3` -> Usage
- `F4` -> Server
- `F5` -> Help
- `q` -> quit
- `l` -> quick log-level control
- `?` or `h` -> help modal/panel
- `tab` -> move focus region
- `enter` -> inspect/open selected item

## Auth UX in TUI

For v1, account add flow should stay practical, not fancy.

Suggested flow:

- open add-account modal/screen
- show verification URL
- show user code
- auto-open browser when possible
- show auth progress / waiting / success / failure

QR support can be added later if useful, but is not required for v1.

## TUI Architecture Rules

### Core dependency rule

The TUI uses the same internal core services as CLI/headless mode.

It should not depend on the local HTTP API for core app actions.

### Widget guidance

Preferred Rezi widgets:

- `logsConsole` for live logs
- `table` for accounts and usage tables
- `virtualList` for long browsable lists

Use tab-like styling for top navigation, but route-based screen ownership under the hood.

## TUI Vibe Rules

The UI should be:

- functional first
- clean and readable
- operator-focused
- not over-designed
- consistent with the current logging personality of the app
