# Qwen Proxy Rewrite Overview

## Purpose

This spec set defines the agreed rewrite plan for moving the current JavaScript proxy into a TypeScript product with:

- a safer core rewrite
- a clean CLI/headless mode
- a Rezi-based TUI on top
- preserved logging feel and file outputs
- runtime-configurable logging
- stable global storage for packaged installs

This directory is the working contract for the rewrite.

## LOCKED AGREEMENTS

These are non-negotiable unless explicitly changed later.

1. **NO ACCIDENTAL FEATURE LOSS**
2. **KEEP LIVE LOG STYLE AND `error.log` STYLE**
3. **USE GLOBAL PERSISTENT STORAGE FOR RUNTIME SETTINGS**

The detailed rules live in `spec/rewrite/safety-and-lifecycle.md`.

## Product Direction

The product will evolve in this order:

1. cleanup current JS safely
2. extract and rewrite the core into TS
3. ship a clean CLI/headless package first
4. build the TUI on top of the same core services

The TUI will not be the only interface.
The final product should support both:

- interactive TUI for operators
- headless/CLI mode for Docker, scripts, and automation

## Reference Inputs Already Chosen

### Current proxy source to preserve behavior from

- `/home/idc/proj/qwen-code-oai-proxy/src/index.js`
- `/home/idc/proj/qwen-code-oai-proxy/src/qwen/api.js`
- `/home/idc/proj/qwen-code-oai-proxy/src/qwen/auth.js`
- `/home/idc/proj/qwen-code-oai-proxy/src/utils/liveLogger.js`
- `/home/idc/proj/qwen-code-oai-proxy/src/utils/fileLogger.js`
- `/home/idc/proj/qwen-code-oai-proxy/authenticate.js`
- `/home/idc/proj/qwen-code-oai-proxy/usage.js`

### Rezi references for TUI guidance

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/README.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/main.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/screens/shell.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/screens/logs.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/logs-console.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/table.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/virtual-list.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/tabs.md`

## Phase Plan

The rewrite phases should stay medium-sized: not tiny, not huge.

### Phase 0 — Safety Cleanup

Goal:

- remove dead or risky leftovers before porting
- fix broken scripts and config drift
- keep behavior unchanged

Main outputs:

- cleaner JS baseline
- no known broken test script references
- rewrite spec remains aligned with reality

### Phase 1 — Core TS Foundation

Goal:

- introduce TS project structure
- split monolithic server responsibilities
- move config, logging contracts, auth, usage, and account logic behind typed services

Main outputs:

- typed core modules
- typed config/runtime state
- typed error and logging contracts

### Phase 2 — CLI / Headless Product

Goal:

- ship the package in a stable non-TUI form first
- keep it script-friendly and Docker-friendly

Main outputs:

- `qwen-proxy` package entry
- `serve --headless`
- auth/usage/account commands as CLI fallbacks

### Phase 3 — Logging + Runtime Controls

Goal:

- preserve current logging outputs
- add runtime log-level switching
- persist operator choices safely

Main outputs:

- one central logging service
- preserved live log formatting
- preserved `error.log` and request-log directory layout

### Phase 4 — TUI Product Layer

Goal:

- add the Rezi operator UI on top of the typed core
- expose logs, accounts, usage, server controls, and help

Main outputs:

- TUI shell
- Logs / Accounts / Usage / Server / Help screens
- runtime controls from UI

### Phase 5 — Hardening + Release Readiness

Goal:

- close parity gaps
- validate no feature loss
- finish docs and packaging polish

Main outputs:

- release-ready package flow
- updated docs
- final parity checklist passed

## Feature Spec Files

- `spec/rewrite/safety-and-lifecycle.md`
- `spec/rewrite/core-typescript-and-cli.md`
- `spec/rewrite/logging-and-debugging.md`
- `spec/rewrite/tui-and-rezi.md`
- `spec/rewrite/storage-and-runtime-config.md`

## Success Criteria

The rewrite is successful when:

- current proxy features still exist unless explicitly removed
- logs still feel like the current app
- runtime log level can be changed safely while the app is running
- packaged installs use stable global storage
- the TUI improves visibility without forcing users away from CLI/headless usage
