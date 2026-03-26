# TypeScript Core Foundation (Phase 1)

## What was added

- TypeScript project setup with `tsconfig.json`
- New typed core surface under `src/core/`
- Typed runtime config store and storage path resolution
- Typed logging contracts and runtime log-level types
- Typed error contract (`ProxyError`)
- Typed auth, account, and usage service contracts
- Split runtime server responsibilities into dedicated JS modules (`src/server/`)
- Added typed core bridge support used by runtime startup/auth paths when core is built

## New core layout

```text
src/core/
  accounts/
  auth/
  config/
  errors/
  logging/
  types/
  usage/
```

## Runtime integration status

The runtime remains JavaScript-first, but now consumes the typed foundation in a controlled way:

- `npm start` and `npm run dev` build core TS first
- runtime boot can load typed core services via `src/server/typed-core-bridge.js`
- auth/runtime-config integration paths are prepared without forcing a full TS-only server switch

## Runtime storage behavior in new config store

The new `RuntimeConfigStore` follows rewrite storage rules:

- packaged default app home: `~/.local/share/qwen-proxy`
- packaged default logs: `~/.local/share/qwen-proxy/log`
- development default logs: `./log`
- env overrides supported:
  - `QWEN_PROXY_HOME`
  - `QWEN_PROXY_CONFIG_DIR`
  - `QWEN_PROXY_LOG_DIR`

## Added npm scripts

- `npm run build:core` -> compile typed core modules
- `npm run typecheck` -> type-check core modules without emitting output
