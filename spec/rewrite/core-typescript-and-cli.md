# Core TypeScript and CLI Rewrite

## Goal

Build a typed core first, then expose it through a stable CLI/headless package before adding the TUI.

This keeps the product useful even before the TUI lands.

Important:

- **Phase 1 = typed foundation**
- **Phase 2 = usable CLI/headless transitional product**
- **Phase 3 = actual full runtime TS migration**

Do not confuse Phase 1 or 2 with "the runtime is now fully TypeScript".

## Rewrite Order

### Step 1 — Extract core service boundaries

Move logic out of the current monolithic entrypoints into typed modules.

Target service areas:

- server lifecycle
- route handlers
- auth/device flow
- account store and rotation
- usage store
- logging service
- runtime config store

### Step 2 — Keep CLI/headless as the first finished product

Before the TUI, the package should already support:

- `qwen-proxy serve --headless`
- `qwen-proxy auth add`
- `qwen-proxy auth list`
- `qwen-proxy auth remove`
- `qwen-proxy usage`

The exact command surface can evolve, but a clean headless path must exist.

### Step 3 — Finish the real runtime migration before TUI

The actual runtime used by operators must move to TS before any real TUI implementation begins.

This migration must cover the heavy remaining runtime paths, not only contracts.

## Target Module Shape

Suggested target structure:

```text
src/
  cli/
  core/
    server/
    routes/
    auth/
    accounts/
    usage/
    logging/
    config/
    storage/
    errors/
    types/
  tui/
```

### Core principles

- TUI depends on core
- CLI depends on core
- headless server depends on core
- core does not depend on TUI
- TUI starts only after the real runtime path is TS-backed

## CLI / Headless Product Rules

### Primary operator modes

1. **TUI mode**
   - `qwen-proxy`

2. **Headless mode**
   - `qwen-proxy serve --headless`

3. **Fallback utility commands**
   - auth/account/usage commands

### Why CLI/headless lands before TUI

Because it provides:

- early package value
- easier parity validation
- easier Docker/systemd usage
- a stable base for TUI integration

## Feature Parity Scope for the Core Rewrite

The typed core must preserve these current behaviors first:

- OpenAI-compatible request handling
- streaming and regular chat completion paths
- multi-account selection and rotation
- auth device flow and token refresh flow
- usage counting and reporting inputs
- live logging, `error.log`, and request debug logs

## Anti-Pattern to Avoid

Do not build the TUI as a wrapper that calls the local HTTP API for everything.

Preferred model:

- TUI talks to the same internal typed services as CLI/headless mode

This avoids:

- duplicated logic
- self-calling network overhead
- state drift between UI and server internals

## Packaging Direction

Package shape should remain Node-based first:

- one npm-installed command
- bundled JS/TS output
- sourcemaps kept for debugging

Standalone frozen native binaries can be evaluated later, but are not the initial target.

## Cleanup Scope Before TS Port

Allowed before the main rewrite:

- remove dead code
- remove obsolete scripts
- fix broken package scripts
- align docs/config drift

Not the goal before TS port:

- re-architect every feature in JS first

## Explicit Runtime Migration Scope

These areas must be fully migrated before the TUI phase starts:

- runtime/server entry and lifecycle
- proxy controller / route handling
- Qwen API runtime
- Qwen auth runtime
- logging runtime
- runtime config wiring
- CLI runtime entry used by operators

Current examples of high-priority migration targets:

- `src/qwen/api.js`
- `src/qwen/auth.js`
- `src/server/headless-runtime.js`
- `src/server/proxy-controller.js`
- `src/server/lifecycle.js`
- `src/utils/fileLogger.js`
- `src/utils/liveLogger.js`
- `src/config.js`
- `src/cli/qwen-proxy.js`

## Phase Deliverables

### Phase 0 deliverables

- cleaned JS baseline
- rewrite blockers removed

### Phase 1 deliverables

- typed config/runtime store
- typed logging contracts
- typed auth/account/usage service boundaries

Important note:

- this phase alone does **not** mean the runtime is fully migrated to TS

### Phase 2 deliverables

- package command entry
- headless serving mode
- CLI utility commands

Important note:

- this phase can still be backed by mixed JS/TS internals and is still transitional

### Phase 3 deliverables

- maintained first-party runtime source migrated to TS with no kept JS runtime source in `src/`
- runtime no longer described as "JavaScript-first"
- typed runtime becomes the primary runtime path
- TUI gate cleared

## Acceptance Rules

This area is complete when:

- the package is useful without the TUI
- the TUI can later consume the same core services without special hacks
- feature parity with the current CLI/headless flows is maintained
- before TUI starts, the real runtime path has been migrated to TS rather than merely wrapped
- maintained first-party source is TS-only for the runtime path; JS migration leftovers are retired, not kept as normal source
