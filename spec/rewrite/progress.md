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

## Phase 5 — TUI Product Layer (in progress)

### 5A — Shell + Layout (complete)

Done:

- full-screen shell using ui.page() with header/body/footer
- left sidebar as primary navigation with 6 nav items
- sidebar collapse/expand toggle via `[` key
- sidebar shows nerd-font icons with fallback to two-letter codes
- subtle vertical keyline divider between sidebar and main content
- header row with runtime status: uptime, host:port, rotation mode, account count, request count, stream count
- footer row with key hints and sidebar mode indicator
- wide layout (>=140 cols) shows workspace details card with contextual screen blurb
- responsive behavior: compact mode at <=100 cols, collapsed sidebar auto-enabled
- theme toggle via `t` key (dark/light)
- icon mode toggle via `i` key (nerd/fallback)

Tests added:

- src/tui/__tests__/keybindings.test.ts: quit, sidebar, icon, theme key resolution
- src/tui/__tests__/reducer.test.ts: sidebar toggle, icon toggle, viewport, navigation, tick, quit, theme cycle
- src/tui/__tests__/render.test.ts: shell markers at 160x40, compact at 80x24, light theme
- scripts/validate-tui-pty.ts: PTY captures for wide/narrow/light modes

PTY evidence:

- wide (160x40): shows qwen-proxy, Live, streams 0, [>] after collapse, theme Dark
- narrow (80x24): shows QP, Live, streams 0, [ toggle, theme Dark
- light (160x40): shows qwen-proxy, Live, streams 0, theme Light, [<] collapse

Review: pass

### 5B — Navigation + Input Model (complete)

Done:

- tab switches focus region (sidebar -> main)
- shift+tab reverses focus region (main -> sidebar)
- arrow up/down moves sidebar selection when sidebar is focused
- enter activates selected sidebar item and navigates to that screen
- ? and h keys navigate to help screen
- sidebar shows visual selection indicator (> prefix) when focused
- sidebar has border when focused to indicate active focus region
- footer shows current focus region (focus:sidebar or focus:main)
- mouse click on sidebar items works via Rezi button onPress handlers

Tests added:

- src/tui/__tests__/keybindings.test.ts: 11 tests covering all keybindings
- src/tui/__tests__/reducer.test.ts: 5 new tests for focus and sidebar navigation
- src/tui/__tests__/render.test.ts: updated to check focus:sidebar indicator

PTY evidence:

- focus-indicator capture verifies focus:sidebar and Tab focus hints
- all 26 tests pass

Review: pass

### 5C — Screen Architecture (complete)

Done:

- implemented all 6 screens with real content and proper Rezi widgets
- Live: server controls row, log-level button group, logsConsole widget for live stream
- Artifacts: fileTreeExplorer widget with split preview pane, path/type/size metadata
- Accounts: table widget with account list, detail panel with refresh/remove actions
- Usage: summary bar with totals+cache metrics, table widget with cache columns
- Settings: theme/sidebar/icon pickers as button groups, storage path info
- Help: two-column layout with keybindings, auth guidance, paths, troubleshooting
- extended TuiState with screen-specific substates (live, artifacts, accounts, usage)
- added reducer actions for all screen interactions
- wired all callbacks through ExtendedScreenRouteDeps
- updated render tests to match new Live screen content

Tests added:

- src/tui/__tests__/render.test.ts: updated to validate new Live screen content

PTY evidence:

- all 26 tests pass
- build passes with no type errors

Review: pass

### 5D — Auth UX (not started)

Next up:

- add-account flow in modal/layer form
- verification link + device code + QR code block
- progress states for waiting / success / failure
