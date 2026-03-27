# TUI and Rezi Spec

## Goal

Build a functional operator TUI that feels like a control room for the proxy.

The TUI must help the operator:

- see live activity
- inspect logs and request artifacts
- manage accounts
- review usage including cache behavior
- control the server

## Phase 5 Sub-Sectors

Use these sub-sectors to keep scope clear inside Phase 5.

### 5A. Shell + Layout

- full-screen shell
- left sidebar as the primary navigation model
- clean main workspace with minimal chrome
- responsive behavior for expanded and collapsed sidebar modes

### 5B. Navigation + Input Model

- mouse-first support where practical
- keyboard-first support remains required
- `tab` / `shift+tab` switch focus region between sidebar and main pane
- arrows operate within the currently focused pane instead of globally switching all screens

### 5C. Screen Architecture

- `Live`
- `Artifacts`
- `Accounts`
- `Usage`
- `Settings`
- `Help`

### 5D. Auth UX

- add-account flow in modal/layer form
- verification link
- device code
- terminal QR code block
- progress states for waiting / success / failure

### 5E. Usage + Cache Metrics

- requests
- input/output token usage
- cache read tokens
- cache write/create tokens
- cache type and cache hit summary

### 5F. Visual System

- clean, low-border product feel
- sidebar icons with fallback rendering
- subtle divider/keyline between sidebar and content
- elevated modal surfaces with terminal-style shadow

## Reference Images

Use these image references when making shell/layout/style choices:

- `/home/idc/proj/pics/t1code.png`
- `/home/idc/proj/pics/image.png`
- `/home/idc/proj/pics/popup.png`

How to use them:

- treat them as visual-direction references, not exact pixel-perfect requirements
- focus on wide-layout feel, sidebar/body balance, low-border cleanliness, and floating modal feel
- ignore the top multiplexer/terminal-manager bar shown in the images; that is not part of the app UI

## Important Rezi Guidance

### Use these local references during implementation

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/AGENTS.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/CLAUDE.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/README.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/design-system.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/dev/live-pty-debugging.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/guide/mouse-support.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/logs-console.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/table.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/virtual-list.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/file-tree-explorer.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/modal.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/tabs.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/main.ts`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/packages/create-rezi/templates/cli-tool/src/screens/shell.ts`

### Important caution

Rezi currently marks itself pre-alpha.

Also, `ui.tabs` is useful but not the safest choice for primary app routing.

### Decision

Use route/screen navigation as the primary implementation model.
Do not use top tabs as the primary shell navigation.
Use a left sidebar as the primary shell navigation.

That gives:

- safer navigation internals
- easier keyboard wiring
- cleaner control over screen state
- better use of width on terminal-wide layouts
- room for icons, badges, and sidebar collapse/expand behavior

## Phase Gate Before TUI Work

Real TUI implementation must not start until the runtime is no longer JavaScript-first.

That means the heavy runtime paths must already be migrated to TS, not merely wrapped by a CLI or bridge.

The TUI phase assumes:

- typed runtime/server exists
- typed logging/runtime-control path exists or is being finalized on typed internals
- the operator-facing runtime path is no longer primarily JS

## Hard UI Requirements

### 1. Full-screen quality

The TUI must make good use of the full terminal.

It should not feel like a tiny centered widget or a half-used canvas.
It should also avoid wasting wide terminals on a shallow top-tab strip when a sidebar makes better use of space.

### 2. Responsive resizing

The layout must adapt when terminal size changes.

This includes:

- shrinking cleanly on smaller terminals
- expanding to use wider terminals
- avoiding broken overlaps or awkward dead space
- preserving useful content hierarchy at different sizes

### 3. Theme support

The TUI must support multiple themes.

Minimum expectation for v1:

- at least one good dark theme
- at least one good light theme

Nice-to-have later:

- extra Rezi built-in themes such as Nord or Dracula

### 4. Visual coherence

Text, panels, status bars, badges, tables, and logs must feel like one product.

This means:

- no random isolated background colors
- no text color that clashes with panel surfaces
- no elements that feel visually detached from nearby surfaces
- use semantic design tokens and Rezi design-system guidance

### 4.1. Clean shell aesthetic

The product direction is intentionally clean and slick, closer to a modern terminal app than an old boxed dashboard.

Required behavior:

- prefer spacing, surface contrast, and alignment over heavy border grids
- avoid boxing every region with strong line art
- use one subtle vertical keyline between sidebar and main content when helpful
- keep the shell visually calm with one main surface family per theme
- allow icons to carry some navigation identity so labels do not do all the work
- reserve stronger borders mostly for modal surfaces, selected previews, or focused subviews that truly need separation

### 5. Button and action-group rendering quality

Buttons and segmented action groups must render as intentional UI, not loose text boxes.

Required behavior:

- highlighted or focused button state must stay inside the button border
- highlight fill or focus styling must not bleed past the bottom border or any other edge
- buttons placed next to each other should share borders cleanly when they are part of one action group
- adjacent buttons in the same group must still remain visually distinct through clear separators, contrast, or border treatment
- avoid doubled borders, broken corners, or uneven joins between neighboring buttons

## Main TUI Shell

```text
┌──────── sidebar ────────┬──────────────────────────────────────────────────────────────────────┐
│ qwen-proxy              │ RUNNING · up 00:21:44 · 127.0.0.1:38471 · RR · 10 acc · req 2      │
│                         │ streams 1                                                            │
│ 󰍹  Live                │                                                                      │
│ 󰉋  Artifacts           │                            active screen area                         │
│ 󰀉  Accounts            │                                                                      │
│ 󰕾  Usage               │                                                                      │
│                         │                                                                      │
│ 󰒓  Settings            │                                                                      │
│ 󰞋  Help                │                                                                      │
│                         │                                                                      │
│ [⟨] collapse            │                                                                      │
├─────────────────────────┼──────────────────────────────────────────────────────────────────────┤
│ Tab pane   Shift+Tab back   Enter open   Click supported   Wheel scroll   Q quit             │
└─────────────────────────┴──────────────────────────────────────────────────────────────────────┘
```

## Layout Rules

- root layout should use the whole screen
- header, screen body, and footer must remain visible and balanced
- screen body should be the main space consumer
- wide terminals should expose more useful detail, not just more padding
- narrow terminals should degrade gracefully with compact layouts where needed
- sidebar should be the primary navigation on normal/wide layouts
- sidebar should support expanded and collapsed modes
- collapsed sidebar should retain icon-driven recognition and focus clarity
- the shell should include a subtle sidebar/content separator when needed instead of a heavy boxed frame
- top-tab navigation may be used only as a fallback/secondary pattern for constrained layouts, not as the main shell pattern
- runtime header data must be truthful to rotation behavior; do not imply one always-active account when round-robin or multi-account behavior is in effect

## Input Rules

- keyboard-first interaction is required
- mouse support is strongly recommended for v1 when Rezi supports it safely for the touched widgets and screens
- if mouse support is added, hover, click, focus, and selection states must stay visually coherent with keyboard focus states
- `tab` and `shift+tab` should switch focus regions, especially between sidebar and main pane
- when the sidebar has focus, arrow keys should move within sidebar items
- when the main pane has focus, arrow keys should be interpreted by the focused main-pane widget or local screen layout
- primary route switching should not depend on `F1`-style function keys
- click on sidebar items must navigate screens directly
- click in the main pane must move focus to the clicked interactive widget when supported by Rezi

## Sidebar Requirements

- sidebar is the primary route switcher
- sidebar items should support icons
- provide graceful fallback icons/text when nerd-font glyphs are unavailable
- sidebar should support collapse/expand toggle
- expanded mode shows icon + label
- collapsed mode keeps icon and active-state clarity while hiding most labels
- include a small visible affordance for collapsing/expanding the sidebar
- use a subtle keyline/divider between sidebar and main content

Suggested icon set with fallback:

- `Live` -> preferred `󰍹`, fallback `LV`
- `Artifacts` -> preferred `󰉋`, fallback `AR`
- `Accounts` -> preferred `󰀉`, fallback `AC`
- `Usage` -> preferred `󰕾`, fallback `US`
- `Settings` -> preferred `󰒓`, fallback `ST`
- `Help` -> preferred `󰞋`, fallback `HP`

## Screen Set

### 1. Live

Purpose:

- live operator visibility
- quick runtime controls
- log-level visibility and quick changes
- request/stream activity awareness

Rules:

- this is the primary operator control room
- it should combine live log streaming with quick server actions such as start / stop / restart
- it should include runtime status such as uptime, host, port, request count, stream count, and rotation mode
- it must not claim one fixed active account in the header when the runtime is using round-robin or otherwise rotating across multiple accounts
- if account summary is shown, use truthful labels such as loaded account count, last used account, selected account for details, or default/pinned account when that concept actually exists
- log-level switching may appear here as a quick action row for operator convenience

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Live                                                                                         │
│ host 127.0.0.1:38471   uptime 00:21:44   rotation RR   accounts 10   req 2   streams 1      │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ Start ] [ Stop ] [ Restart ]      log: [ off ] [ error ] [ err-debug ] [ debug ]          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ live stream                                                                                  │
│ 10:36:08  server started                                                                     │
│ 10:36:10  POST /v1/chat/completions 200  4809+1 tok                                          │
│ 10:36:11  cache create 4805                                                                  │
│ 10:36:18  cache hit 4805                                                                     │
│ 10:36:20  req-a4783f17 created                                                               │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Artifacts

Purpose:

- browse request/debug artifacts from real `req-<id>` folders
- inspect request/response/debug files in a file-tree model
- preview selected file content and metadata

Required behavior:

- use a tree/file-explorer style widget, not a flat dump of filenames
- left side should browse folders/files
- right side should preview selected file content or metadata
- tree view should support keyboard navigation, mouse selection, wheel scroll, and open/inspect actions
- this screen exists so the `Live` screen stays focused on current activity instead of mixing current live stream with deep artifact browsing

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Artifacts                                                                                    │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ req-a4783f17/                                │ Preview / metadata                            │
│ ├─ request.json                              │ path: req-a4783f17/request.json               │
│ ├─ response.json                             │ type: json                                    │
│ ├─ stream.log                                │ size: 4.1 KB                                  │
│ └─ headers.txt                               ├───────────────────────────────────────────────┤
│ req-67bb566a/                                │ file preview                                  │
│ ├─ request.json                              │ {                                             │
│ └─ response.json                             │   "model": "qwen3-coder-plus",             │
│                                              │   "usage": { ... }                           │
│                                              │ }                                             │
└──────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### 3. Accounts

Purpose:

- view all accounts
- see validity/expiry/counts
- add/remove/refresh accounts
- manage default account behavior if supported

Important action-group rule:

- `Add account` is not in the same action category as `Refresh selected` or `Remove selected`
- adding a new account should be grouped near the new-account input/auth entry area
- refresh/remove actions should live in a selected-account area or selected-row toolbar because they depend on current selection

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Accounts                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Add new account                                                                              │
│ [ account id input ]   [ + Add account ]                                                     │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ ID         status     expires         today  │ selected account details                      │
│ default    valid      18:22 today     82     │ id: acc-2                                     │
│ acc-2      valid      20:10 today     144    │ status: valid                                 │
│ acc-3      expired    --              0      │ expires: today 18:22                          │
│                                              │ [ Refresh selected ] [ Remove selected ]      │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ A add   R refresh selected   D remove selected   Enter inspect                               │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4. Usage

Purpose:

- inspect token/request usage quickly
- keep summary readable first, fancy charts later
- expose cache behavior, not only raw input/output tokens

Important API evidence:

Real OpenAI-compatible responses in this project can include cache details inside `usage.prompt_tokens_details`, including:

- `cached_tokens`
- `cache_creation_input_tokens`
- nested cache-creation buckets such as `cache_creation.ephemeral_5m_input_tokens`
- `cache_type`

That means the TUI usage model should plan for cache metrics explicitly instead of pretending input/output tokens are the full story.

Required cache fields:

- cache read tokens
- cache write/create tokens
- cache type summary
- cache hit rate summary when derivable

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Usage                                                                                        │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Today: req 226   input tok 120k   output tok 88k   cache read 64k   cache write 18k         │
│ cache hit 53%   cache type ephemeral                                                         │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│ Date         Req   In Tok   Out Tok   Cache Read   Cache Write   Hit %                       │
│ 2026-03-24   120   55k      40k       21k          7k            38%                         │
│ 2026-03-25   188   90k      63k       44k          12k           49%                         │
│ 2026-03-26   226   120k     88k       64k          18k           53%                         │
├──────────────────────────────────────────────┴───────────────────────────────────────────────┤
│ / search   ↑↓ move   Enter inspect                                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5. Settings

Purpose:

- persistent operator settings
- theme choice
- sidebar behavior choice
- default log-level choice
- storage/config/runtime preference visibility

Suggested layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Settings                                                                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ Theme              [ Dark ] [ Light ] [ Nord ] [ Dracula ]                                  │
│ Sidebar            [ Expanded ] [ Collapsed ]                                               │
│ Sidebar icons      [ Nerd Font ] [ Fallback ]                                               │
│ Default log level  [ off ] [ error ] [ error-debug ] [ debug ]                              │
│                                                                                              │
│ Storage/config/runtime details                                                               │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 6. Help

Purpose:

- shortcuts
- auth guidance
- common troubleshooting notes
- pointer to paths like log dir and config dir
- may exist as a screen and/or quick modal depending on shell context

## Keyboard Plan

Suggested defaults:

- `q` -> quit
- `tab` -> switch focus region (sidebar <-> main)
- `shift+tab` -> reverse focus-region switch
- `up/down` -> move inside current focused collection when that collection supports it
- `left/right` -> local widget navigation where appropriate
- `enter` -> inspect/open selected item
- `space` -> activate focused button/toggle where appropriate
- `l` -> quick log-level control on screens that expose it
- `[` or dedicated control -> collapse/expand sidebar if desired
- `?` or `h` -> help modal/panel

Important:

- function-key routing such as `F1..F5` is not the primary navigation model for this TUI
- if such shortcuts exist at all, they are secondary convenience bindings and should not shape the visual shell design

## Auth UX in TUI

For v1, account add flow should stay practical, but it must include the useful pieces already proven by the CLI auth flow.

Suggested flow:

- open add-account modal/screen
- show verification URL
- show user code
- show terminal QR code block
- auto-open browser when possible
- show auth progress / waiting / success / failure

QR support is required for this TUI revision.

Suggested auth modal:

```text
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░ Add account · acc-2                       ░
░──────────────────────────────────────────░
░ stage: waiting                           ░
░                                          ░
░ link: https://...                        ░
░ code: ABCD-EFGH                          ░
░                                          ░
░ █▀▀▀▀▀█ ▄▀▀ ▄ █▀▀▀▀▀█                     ░
░ █ ███ █ ▀▄▀█▄ █ ███ █                     ░
░ █ ▀▀▀ █ ▄█ ▄█ █ ▀▀▀ █                     ░
░ ▀▀▀▀▀▀▀ ▀ ▀ ▀ ▀▀▀▀▀▀▀                     ░
░                                          ░
░ [ Open browser ]   [ Close ]             ░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

## TUI Architecture Rules

### Core dependency rule

The TUI uses the same internal core services as CLI/headless mode.

It should not depend on the local HTTP API for core app actions.

### Widget guidance

Preferred Rezi widgets:

- `logsConsole` for live logs
- `table` for accounts and usage tables
- `virtualList` for long browsable lists
- `fileTreeExplorer` for request/debug artifact browsing

Use route/screen ownership under the hood.
Primary shell navigation should be sidebar-driven, not top-tab-driven.

## Theme and Color Rules

Follow Rezi design-system guidance from:

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/design-system.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/CLAUDE.md`

Rules:

- prefer semantic theme tokens over hardcoded colors
- use adjacent surface/elevation levels for nearby panels
- keep focus states readable in both dark and light themes
- logs, tables, badges, and status bars should inherit a coherent palette
- sidebar active state should read clearly in expanded and collapsed modes
- modal and popup flows should use elevated surfaces and terminal-style shadow for a floating-window feel where practical
- do not chase GUI blur/glass effects that terminals cannot reproduce faithfully

## Testing Rules for the TUI

Follow Rezi best-practice testing guidance.
This is mandatory, not optional.

### Required validation types

1. state/reducer/keybinding tests where logic exists
2. focused screen/render tests where practical
3. live PTY validation for UI regressions
4. theme checks in at least one dark theme and one light theme
5. run the real TUI during implementation and visually inspect it to understand the actual layout, spacing, borders, and highlight behavior
6. validate button groups and highlighted controls in the real app so border bleed, broken joins, and bad focus rendering are caught before phase completion

### PTY validation reference

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/dev/live-pty-debugging.md`

Use PTY checks especially when touching:

- layout
- theme switching
- tables
- logs console
- route/screen composition
- buttons or action groups
- focus, highlight, hover, or selection states
- sidebar collapse/expand behavior
- sidebar icon fallback behavior
- file-tree explorer interaction
- QR/auth modal rendering
- cache metrics presentation in usage views

## Source Repo Guidance Is Mandatory

Implementation must follow the Rezi source repo guidance and best practices from the local references listed in this spec.

This is a must-have requirement for Phase 5 work.

At minimum, Phase 5 implementation and review must use:

- `/home/idc/proj/qwen-code-oai-proxy/Rezi/AGENTS.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/CLAUDE.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/README.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/design-system.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/dev/live-pty-debugging.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/guide/mouse-support.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/logs-console.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/table.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/virtual-list.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/file-tree-explorer.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/modal.md`
- `/home/idc/proj/qwen-code-oai-proxy/Rezi/docs/widgets/tabs.md`

## TUI Vibe Rules

The UI should be:

- functional first
- clean and readable
- operator-focused
- not over-designed
- consistent with the current logging personality of the app
- visually polished enough to feel intentional in daily use
- wide-layout friendly
- low-border and surface-driven rather than line-art heavy
