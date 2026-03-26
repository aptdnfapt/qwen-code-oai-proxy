# Rewrite Progress

## Status Snapshot

- Phase 0: complete
- Phase 1: complete
- Phase 2: not started
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

## Validation Log

- `npm test` -> pass
- `npm run test:simple` -> pass
- `npm run test:proxy` -> pass
- `npm run typecheck` -> pass
- `npm run build:core` -> pass

## Next Phase

Phase 2: CLI/headless package surface (`qwen-proxy`, `serve --headless`, auth/usage/account CLI commands).
