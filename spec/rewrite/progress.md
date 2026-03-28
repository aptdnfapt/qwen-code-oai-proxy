# Rewrite Progress

## Status Snapshot

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Phase 4: complete
- Phase 5: in progress
- Phase 6: not started

## Phase 0 — Safety Cleanup (complete)

Done:

- cleaned dead/risky leftovers in runtime entry (`src/index.js` split + dead import removal)
- fixed broken package script references to missing files
- replaced missing-script test commands with tracked validation script (`scripts/validate-runtime.js`)
- removed stale logging config drift by supporting legacy aliases:
  - `DEBUG_LOG` -> `LOG_LEVEL`
  - `LOG_FILE_LIMIT` -> `MAX_DEBUG_LOGS`
- aligned docs with current config and script behavior

Acceptance check:

- cleaner JS baseline -> yes
- rewrite blockers removed -> yes
- no known broken test script references -> yes

## Phase 1 — Core TS Foundation (complete)

Done:

- introduced TypeScript project scaffold (`tsconfig.json`)
- added typed core modules under `src/core/`:
  - config/runtime store
  - logging contracts/types
  - auth/account/usage contracts and adapters
  - typed error contract
- split monolithic server responsibilities into dedicated modules:
  - `src/server/proxy-controller.js`
  - `src/server/health-handler.js`
  - `src/server/lifecycle.js`
  - `src/server/middleware/api-key.js`
- moved auth usage in runtime through service boundary support:
  - typed bridge loader (`src/server/typed-core-bridge.js`)
  - controller/health/lifecycle support typed auth service when built
- start/dev now build typed core before runtime boot (`package.json`)

Acceptance check:

- typed config/runtime store -> yes
- typed logging contracts -> yes
- typed auth/account/usage service boundaries -> yes

## Phase 2 — CLI / Headless Product (complete)

Done:

- added package command entry (`qwen-proxy`) via npm `bin`
- added headless serve command surface:
  - `qwen-proxy serve --headless`
  - optional host/port overrides: `--host`, `--port`
- extracted reusable server bootstrap into `src/server/headless-runtime.js`
- kept legacy runtime entry compatibility by routing `src/index.js` through the headless bootstrap
- added CLI fallback utility command routing:
  - `qwen-proxy auth [list|add|remove|counts]`
  - `qwen-proxy usage`
  - `qwen-proxy tokens`
- refactored existing utility scripts to support command reuse without breaking existing npm command flows
- updated docs for the new CLI/headless command surface

Acceptance check:

- package command entry -> yes
- `serve --headless` -> yes
- auth/usage/account CLI fallbacks -> yes

Important note:

- this phase delivered a usable transitional CLI/headless product
- it did **not** mean the real runtime was fully migrated to TS

## Phase 3 — Full Runtime TS Migration (complete)

Done:

- migrated the main operator-facing runtime to TS:
  - `src/config.ts`
  - `src/qwen/auth.ts`
  - `src/qwen/api.ts`
  - `src/utils/fileLogger.ts`
  - `src/utils/liveLogger.ts`
  - `src/server/proxy-controller.ts`
  - `src/server/lifecycle.ts`
  - `src/server/headless-runtime.ts`
  - `src/cli/qwen-proxy.ts`
  - `src/index.ts`
- removed the maintained source `.js` runtime files instead of keeping JS migration wrappers
- expanded build output from core-only TS to the operator runtime TS surface
- updated npm scripts so runtime validation, auth, usage, and package preparation all build the TS runtime first
- added package include/build hooks so `dist/` is present for installs and publish flows

Acceptance check:

- major runtime JS files migrated -> yes
- runtime no longer JS-first for operator path -> yes
- typed runtime is primary runtime path -> yes
- maintained first-party runtime source is TS-only -> yes
- TUI gate cleared -> yes

Clarification:

- the operator-facing boot/auth/api/logging/server path now builds from TS and runs from `dist/`

## Phase 4 — Logging / Runtime Controls (complete)

Done:

- added one shared runtime logging service for live/file logging state
- wired runtime log-level changes to the real typed runtime
- loaded persisted runtime log level before normal runtime boot logs
- added runtime control endpoints:
  - `GET /runtime/log-level`
  - `POST /runtime/log-level`
- kept classic live log style and `error.log` / request-log layout
- restored `req-<id>/error.json` artifact parity for failed debugged requests

Acceptance check:

- one central logging service -> yes
- runtime log-level switching -> yes
- persistent operator choices applied to typed runtime -> yes

## Validation Log

- `npm test` -> pass
- `npm run test:simple` -> pass
- `npm run test:proxy` -> pass
- `npm run typecheck` -> pass
- `npm run build:core` -> pass
- `GET /runtime/log-level` smoke test -> pass
- `POST /runtime/log-level` memory-only change smoke test -> pass
- `RuntimeConfigStore({ DEBUG_LOG=true }).resolveStartupLogLevel()` -> `debug`
- `node dist/src/cli/qwen-proxy.js help` -> pass
- `node dist/src/cli/qwen-proxy.js serve --headless --help` -> pass
- `node dist/authenticate.js --help` -> pass
- `node dist/usage.js --help` -> pass

## Next Phase

Phase 5: TUI product layer.

Work in flight:

- 5A shell/layout implementation is under review before completion is marked.
