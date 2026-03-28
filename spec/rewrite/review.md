# Rewrite Review Guide

## Goal

Use this file as the implementation-review gate after each phase or major sub-sector.

The review agent should answer one question clearly:

- was the requested phase implemented correctly according to spec, or not?

## When to Run Review

Run a review:

- after each completed phase
- after a major sub-sector inside a phase
- before starting the next phase
- after any risky TUI/layout/runtime change

For Phase 5, good review checkpoints are:

- 5A shell + layout
- 5B navigation + input
- 5C screens
- 5D auth modal + QR
- 5E usage + cache metrics
- 5F visual/style polish

## Reviewer Agent Model

Default reviewer:

- use a general-purpose agent to verify the finished work end-to-end

Optional second pass:

- use a code-review-focused agent after the general agent if you want extra issue finding

Important rule:

- the reviewer is not there to continue implementation
- the reviewer is there to compare spec vs code vs evidence and report gaps honestly

## Required Review Inputs

The review agent must read:

- the target phase spec file(s)
- `spec/rewrite/safety-and-lifecycle.md`
- any updated docs tied to the change
- the changed implementation files
- the current `git diff`
- relevant test output
- for TUI work, PTY validation evidence

## Required Review Output

The review result must be structured like this:

### 1. Verdict

- `pass`
- `pass with gaps`
- `fail`

### 2. What matches spec

- bullet list
- include file paths and line numbers where possible

### 3. What is missing or wrong

- bullet list
- include file paths and line numbers
- say whether the issue is missing behavior, partial behavior, wrong behavior, docs drift, or test gap

### 4. Risk notes

- list feature-loss risks
- list regressions that still need manual confirmation

### 5. Validation evidence used

- tests run
- PTY run details
- snapshot/frame evidence used

## Review Prompt Template

Use a prompt shaped like this for the general agent:

```text
You are a software implementation review agent. Your job is to verify whether a completed phase was implemented correctly.

Act as a strict reviewer, not an implementer.

Review target:
- <phase or sub-sector name>

You must:
- read the target spec files first
- read safety/lifecycle rules
- inspect the changed files and current git diff
- compare implementation against spec behavior, not just names
- check tests and runtime evidence
- for TUI work, use PTY/frame evidence and do not rely only on code reading

Return only:
1. verdict: pass / pass with gaps / fail
2. implemented correctly
3. missing or incorrect items
4. risks
5. exact file:line references for each important finding

Do not be vague. If something is not implemented, say it directly.
```

## Review Procedure

```text
Review flow
├─ 1. Read spec scope
├─ 2. Read safety/lifecycle rules
├─ 3. Read changed files + git diff
├─ 4. Check behavior against spec bullets
├─ 5. Check tests/evidence
├─ 6. For TUI, check PTY evidence
└─ 7. Return verdict with file:line proof
```

## What the Reviewer Must Verify

### General

- target behavior exists
- spec wording still matches reality
- no obvious feature loss in touched area
- docs and implementation do not contradict each other
- tests cover the risky paths

### TUI-Specific

- layout matches the intended shell model
- input model matches spec
- focus behavior matches spec
- mouse behavior matches spec where claimed
- modal/overlay behavior matches spec
- icons/fallbacks do not break layout
- theme behavior is coherent in dark and light modes
- passive info/empty states are not rendered as routine bordered card/callout boxes unless the spec explicitly allows that specific case
- real PTY run was done

### Usage / Metrics-Specific

- usage fields shown in UI actually exist in runtime data
- derived metrics are computed honestly
- labels do not over-claim unsupported metrics

## Review Evidence Ladder

Use stronger evidence first.

```text
best
├─ real running behavior in PTY
├─ frame-audit evidence
├─ deterministic text-frame snapshots
├─ focused render/integration tests
├─ unit tests
└─ code reading only
weakest
```

Do not approve major TUI work from code reading alone.

## Visible Testing Strategy

For review, keep testing visible and reviewable.

### Required visible evidence

- build/type/test command output
- PTY run command used
- what keys/click paths were exercised
- a text snapshot or frame capture of important screens
- any frame-audit summary when layout/render issues are involved

### Good strategy for terminal UI work

```text
visible evidence
├─ build + test logs
├─ PTY run with deterministic viewport
├─ text frame snapshot of screen output
├─ frame-audit logs for render/layout bugs
└─ optional cast/GIF/image capture if needed
```

## Screenshot / Visual Capture Answer

### Can an agent produce a visible capture of the terminal app?

- yes, visible capture is possible
- but the best default is not a manual desktop screenshot

### Best options

#### 1. Deterministic text-frame snapshots

Best for review because they are stable and diffable.

Useful references:

- `Rezi/docs/packages/testkit.md`
- `Rezi/docs/dev/testing.md`

#### 2. Live PTY + frame audit

Best for real runtime validation.

Useful reference:

- `Rezi/docs/dev/live-pty-debugging.md`

#### 3. Terminal recording / cast / GIF

Possible when you want something visually closer to a screenshot/demo.

Rezi already documents recording/capture flows in its dev/testing docs.

### Important reality

- PNG-style desktop screenshots are environment-dependent
- they are possible only if the runtime has the right terminal/display capture tooling
- they should be treated as optional polish evidence, not the main verification method

So the default answer is:

- yes, visible capture is possible
- but use PTY + text snapshots + frame audit as the primary review evidence
- use image/GIF capture only when needed for human-facing review

## Minimum Command Checklist

Adapt per phase, but for TUI work the review should usually include some form of:

- `npm run build:core`
- `npm run test:tui`
- `npm test`
- real PTY launch of the TUI

For PTY/layout-sensitive work, also include deterministic viewport setup and frame-audit methods when practical.

## Phase Gate Rule

Do not move to the next phase when the reviewer returns:

- `fail`
- or `pass with gaps` on a must-have behavior

Fix the gaps first, then run the review again.

## Final Principle

The review guide exists to stop fake completion.

If the spec says a behavior must exist, the reviewer should demand proof from code, tests, and runtime evidence before approving the phase.
