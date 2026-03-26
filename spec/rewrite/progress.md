# Rewrite Progress

## Status Snapshot

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: not started
- Phase 4: not started
- Phase 5: not started

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

## Validation Log

- `npm test` -> pass
- `npm run test:simple` -> pass
- `npm run test:proxy` -> pass
- `npm run typecheck` -> pass
- `npm run build:core` -> pass
- `node src/cli/qwen-proxy.js help` -> pass
- `node src/cli/qwen-proxy.js serve --headless --help` -> pass
- `node src/cli/qwen-proxy.js auth --help` -> pass
- `node src/cli/qwen-proxy.js usage --help` -> pass

## Next Phase

Phase 3: logging/runtime controls (central logging service, runtime log-level switching, persistent operator choices).
