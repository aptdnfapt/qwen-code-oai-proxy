# Rewrite Progress

## Status Snapshot

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Phase 4: complete
- Phase 5: complete
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

## Phase 5 — TUI Product Layer (complete)

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

### 5D — Auth UX (complete)

Done:

- added Accounts add-account flow in a Rezi modal layer
- account ID input now starts named-account auth directly from the TUI
- modal shows verification link, device code, and terminal QR block
- modal waiting state now includes an `Open browser` action alongside close
- modal exposes clear waiting / success / failure states with status copy
- successful auth refreshes the Accounts table and selects the new account
- added `a` shortcut on the Accounts screen to open the add-account modal

Tests added:

- src/tui/__tests__/reducer.test.ts: auth modal open/close, waiting flow, account refresh selection coverage
- src/tui/__tests__/render.test.ts: Accounts auth modal waiting-state render coverage
- scripts/validate-tui-pty.ts: auth-modal PTY capture

PTY evidence:

- auth waiting capture shows Add account modal -> Account ID -> ABCD-EFGH -> Open browser
- npm run typecheck -> pass
- npm run test:tui -> pass (30 tests)

Review: pass (confirmed during the Phase 5 completion sweep)

### 5E — Usage + Cache Metrics (complete)

Done:

- Usage screen now reads real persisted runtime usage data instead of empty placeholder state
- daily usage aggregation now includes:
  - requests
  - input tokens
  - output tokens
  - cache read tokens
  - cache write/create tokens
  - cache type label
  - derived cache hit rate
- streaming usage capture now parses final SSE `usage` payloads and records cache metrics too
- Usage screen now adds:
  - summary bar for today
  - search/filter input
  - cache-aware table columns
  - fallback request display for older rows without exact request counts
- PTY validation script now includes deterministic dark/light Usage captures with non-zero cache fixture data

Tests added:

- src/tui/__tests__/usage-metrics.test.ts: SSE usage parsing coverage
- src/tui/__tests__/usage-runtime.test.ts: runtime usage aggregation coverage
- src/tui/__tests__/render.test.ts: Usage screen cache metrics + light theme coverage
- src/tui/__tests__/reducer.test.ts: usage filter/selection state coverage

PTY evidence captured:

- usage-cache-metrics: dark theme Usage screen with non-zero cache read/write/type values
- usage-cache-metrics-light: light theme Usage screen with non-zero cache read/write/type values

Review: pass

### 5F — Visual System polish (complete)

Done:

- switched the dark theme to a calmer Nord-based token set while keeping light theme runtime switching
- sidebar and main-pane focus are now explicit in the shell with stronger NAV / MAIN focus badges
- sidebar active state is clearer in both expanded and collapsed modes with visible markers (`>`, `*`, `QP>`)
- Live, Settings, and Accounts action rows now use `ui.actions()` so grouped buttons render as one joined control set
- Settings pickers now apply exact theme/sidebar/icon selections instead of toggle-only behavior
- sidebar `Enter` now navigates the real routed screen instead of only mutating local shell state
- Live main-pane focus now shows a visible default control marker (`> Start` / `> Stop` / `> Restart`) for PTY-verifiable focus state
- auth modal waiting-state validation now uses a deterministic fixture and verifies the `Open browser` button in the real TUI

Tests added:

- `src/tui/__tests__/reducer.test.ts`: explicit theme/sidebar/icon setter coverage plus an honest running-runtime uptime tick case
- `src/tui/__tests__/render.test.ts`: NAV FOCUS shell marker, Live main-pane control focus marker, and auth modal `Open browser` coverage
- `scripts/validate-tui-pty.ts`: added `live-main-controls-focus`, `sidebar-enter-accounts`, and auth-waiting modal captures

PTY evidence captured:

- live-main-focus (160x40, dark): shows `MAIN FOCUS` and `> Start` on the Live control row
- sidebar-enter-accounts (160x40, dark): `↓`, `↓`, `Enter` lands on the real Accounts body with `Add new account`
- light theme (160x40): shows `theme Light` with the polished shell and grouped controls intact
- auth waiting fixture (160x40): shows `Add account`, `ABCD-EFGH`, `Open browser`, and `Close`
- frame audit: all reviewed runs reported `hash_mismatch_backend_vs_worker=0`

Review: pass
