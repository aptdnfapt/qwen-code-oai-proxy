# Rewrite Safety and Lifecycle

## HARD RULES

### HARD RULE 1 — NO ACCIDENTAL FEATURE LOSS

The rewrite must preserve current behavior unless a removal is explicitly approved.

This includes:

- OpenAI-compatible proxy routes
- streaming and non-streaming chat
- multi-account auth and rotation
- usage reporting
- error logging
- per-request debug logging
- CLI auth/account workflows

### HARD RULE 2 — DO NOT BREAK THE LIVE LOG STYLE OR `error.log` STYLE

The rewrite may improve the internals, but must preserve the operator-facing logging style.

That means preserving the feel of:

- arrow/glyph based live logs like `→`, `←`, `✗`, `↻`, `●`
- separator style using `|`
- account tags like `[default]`
- readable short one-line live events
- text-block `error.log` entries

### HARD RULE 3 — USE GLOBAL PERSISTENT STORAGE FOR RUNTIME SETTINGS

Runtime settings such as log level must live in stable application storage for packaged installs.

Default base path:

- `~/.local/share/qwen-proxy`

### HARD RULE 4 — THE TUI MUST LOOK GOOD, USE THE FULL SCREEN WELL, AND SUPPORT THEMES

The TUI is not allowed to feel like a broken debug panel.

It must:

- use the available terminal space well
- resize cleanly with terminal size changes
- look visually intentional in both dark and light themes
- keep text/background/surface colors semantically consistent
- avoid panels or text blocks that feel visually out of place

This is a product requirement, not optional polish.

## Rewrite Operating Model

### Rule: rewrite in slices, not in blind bulk

We do not replace the whole project in one jump.

We move in slices:

1. cleanup
2. extract contracts
3. rewrite module-by-module
4. verify parity
5. wire TUI last

### Rule: large-file rewrites require explicit parity review

If a file is rewritten heavily or replaced entirely:

1. list the behaviors currently present
2. map them to the new file/module locations
3. inspect `git diff` to confirm nothing important disappeared
4. call out any intentional removals explicitly

## File Rewrite Checklist

Use this whenever touching a major file such as:

- `src/index.js`
- `src/qwen/api.js`
- `src/qwen/auth.js`
- `src/utils/fileLogger.js`

### Before editing

- identify the behaviors the file owns
- identify which of those behaviors are user-visible
- identify cross-file dependencies
- identify log or storage side effects

### During editing

- preserve feature parity first
- do not mix cleanup, redesign, and feature additions in one risky jump
- isolate behavior moves behind small typed modules
- mark assumptions clearly in specs and commit/work notes

### After editing

- inspect `git diff`
- verify feature coverage for the touched area
- verify logs still match expected style if logging code was touched
- verify storage paths still follow spec rules

## Definition of “Safe Cleanup” Before Rewrite

Safe cleanup means low-risk removals or fixes that reduce noise before porting.

Allowed examples:

- remove dead imports
- remove dead helpers with no callers
- remove broken npm script references
- align stale docs to actual current behavior
- remove clearly unsafe or obsolete scratch scripts

Not allowed under “safe cleanup” without explicit approval:

- changing core route behavior
- changing auth flow behavior
- redesigning logging format
- changing request/account rotation semantics

## Parity Review Rules

### For each rewritten feature area

Track these questions:

1. what existed before?
2. where does it live now?
3. what changed intentionally?
4. what was preserved exactly?

### If something is unclear

Do not guess silently.

Instead:

- mark it as an assumption
- keep the old behavior until clarified

## Logging Protection Rules

If a change touches logging:

- preserve the visible line style of live logs
- preserve the block layout of `error.log`
- preserve request-log directory names and file names unless explicitly migrated with compatibility notes
- do not rename core operator concepts casually

## TUI Quality Protection Rules

If a change touches the TUI:

- it must remain responsive to terminal size changes
- it must use semantic theme/surface tokens rather than random ad-hoc colors
- it must support at least one strong dark theme and one strong light theme in v1
- text backgrounds and surrounding panel backgrounds must feel visually coherent
- the screen should make good use of full-screen layout instead of looking tiny or centered awkwardly

## Rezi Testing Protection Rules

If a change touches the TUI, use Rezi best-practice validation as part of the workflow.

Important reference paths:

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/AGENTS.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/CLAUDE.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/dev/live-pty-debugging.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/design-system.md`

Expected testing categories:

- unit tests for reducers/state/keybindings where relevant
- focused screen/render tests where practical
- live PTY validation for layout/theme/render regressions
- theme checks in both dark and light modes

## Runtime Config Protection Rules

If a change touches config/runtime settings:

- do not tie packaged runtime state to repo-local paths
- keep operator-changed settings persistent
- allow env var overrides for directories and defaults
- document precedence rules clearly

## Done Criteria Per Phase

Each phase is only done when:

- the target behavior exists
- the hard rules were respected
- affected docs/specs are still accurate
- `git diff` has been reviewed for feature loss risk

## Non-Goals During Rewrite

These are not mandatory unless requested later:

- changing auth credential storage away from `~/.qwen` immediately
- replacing the current logging style with structured-only logs
- making the TUI the only interface
