# Phase 0 Cleanup Notes

## Goal

Apply low-risk cleanup before deeper TypeScript migration while keeping runtime behavior unchanged.

## Completed cleanup items

- Removed broken npm script references to missing files (`test-proxy.js`, `test-simple.js`)
- Added tracked runtime validation script at `scripts/validate-runtime.js`
- Updated test scripts to run tracked validation:
  - `npm test` -> `node scripts/validate-runtime.js`
  - `npm run test:simple` -> `node scripts/validate-runtime.js`
  - `npm run test:proxy` -> `node scripts/validate-runtime.js`
- Replaced risky `test.sh` payload that contained a hardcoded bearer token with a safe local-proxy smoke script
- Removed unused imports/instances from `src/index.js` (`QwenAuthManager`, `DebugLogger`)
- Removed module-load side effect from `src/utils/fileLogger.js` (cleanup scheduler now starts only when explicitly called)
- Reduced logging config drift:
  - `DEBUG_LOG=true` now maps to `LOG_LEVEL=debug`
  - `LOG_FILE_LIMIT` now maps to `MAX_DEBUG_LOGS`
- Updated docs to match real logging env variables and compatibility aliases

## Validation

- `npm run typecheck` passes
- `npm test` passes
- `npm run test:simple` passes
- `npm run test:proxy` passes
