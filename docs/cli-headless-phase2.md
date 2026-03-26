# CLI and Headless Surface (Phase 2)

## Goal

Expose a stable package command before TUI work so the rewrite is usable in scripts, Docker, and automation.

## What was added

- New package CLI entry: `qwen-proxy` (npm bin)
- Headless server command: `qwen-proxy serve --headless`
- Runtime host/port overrides on serve command:
  - `--host <host>`
  - `--port <port>`
- Fallback utility commands wired into the same package command:
  - `qwen-proxy auth [list|add <id>|remove <id>|counts]`
  - `qwen-proxy usage`
  - `qwen-proxy tokens`

## Runtime wiring changes

- Added `src/server/headless-runtime.js` to own Express app/runtime boot in reusable form
- Kept `src/index.js` as a compatibility entry that now calls the headless runtime bootstrap
- Updated npm scripts:
  - `npm start` -> `qwen-proxy serve --headless`
  - `npm run dev` -> `qwen-proxy serve --headless`
  - `npm run serve:headless` added

## Notes

- TUI mode is still planned for a later phase
- Existing scripts (`authenticate.js`, `usage.js`) remain usable and are now callable by the new CLI entry
