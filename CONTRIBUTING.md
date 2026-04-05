# Contributing to qwen-proxy

Thank you for your interest in contributing! This guide outlines how to set up, develop, and submit contributions.

---

## Getting Started

### Prerequisites

- **Node.js** 16+ (tested with v18+)
- **npm** 8+
- TypeScript knowledge (codebase is TypeScript-first)

### Setup

```bash
git clone https://github.com/aptdnfapt/qwen-code-oai-proxy
cd qwen-code-oai-proxy
npm install
cp .env.example .env
```

### Development Workflow

```bash
# Typecheck
npm run typecheck

# Build
npm run build:core

# Run tests (simple validation)
npm run test:simple

# Run full test suite
npm run test

# Run dev server (headless)
npm run dev

# Start with TUI
npm run build:core
node dist/src/cli/qwen-proxy.js serve
```

---

## Code Conventions

### TypeScript & Formatting

- **No auto-fixes**: Avoid tools that auto-correct quote styles (`'` → `"`) or other formatting. These create noise in git history.
- **Existing patterns**: Study the codebase first — follow existing imports, library choices, and patterns.
- **No comments required**: Code should be self-documenting. Comments are not expected unless explaining complex logic.

### File Structure

- **Source**: `src/` (TypeScript)
- **Compiled**: `dist/` (generated, do not commit)
- **Tests**: `scripts/` (validation scripts)
- **Documentation**: `docs/` (one file per feature/topic)

### Key Libraries (already in use)

- **Express** — HTTP server & routing
- **TypeScript** — Type safety
- **better-sqlite3** — Token usage tracking
- **winston** — Logging
- **chalk** — Terminal colors
- **@mariozechner/pi-tui** — Terminal UI

Do not add new dependencies without discussion. Check `package.json` for what's available.

---

## Testing

### Before Submitting

All PRs must pass these checks:

```bash
# 1. Type checking
npm run typecheck

# 2. Compile
npm run build:core

# 3. Simple validation
npm run test:simple

# 4. Full test suite (requires Qwen auth setup)
npm run test
```

### Test Scripts

- **`npm run test:simple`** — Basic proxy + auth flow validation
- **`npm run test:auth-clean-home`** — Auth on fresh machine (no ~/.qwen)
- **`npm run test:first-run`** — First-run onboarding flow
- **`npm run test:install-smoke`** — Packaged npm install smoke test

**Note:** Full tests require valid Qwen accounts. See `docs/testing-clean-home.md` for details.

---

## AI-Generated Contributions

AI-generated code is **allowed and welcome**, with these requirements:

### Mandatory Reviews

1. **Manual verification** — Ensure the solution is correct and follows project patterns
2. **Test locally** — Run the full test suite; all tests must pass
3. **No git noise** — Do NOT auto-commit formatting or quote style changes
4. **Logic review** — Verify the implementation matches the intended behavior

### Checklist for AI Contributions

- [ ] Code follows existing patterns in the codebase
- [ ] Typecheck passes: `npm run typecheck`
- [ ] Build succeeds: `npm run build:core`
- [ ] All tests pass: `npm run test`
- [ ] No auto-formatting changes (preserve original style)
- [ ] If adding a feature, add corresponding documentation in `docs/`
- [ ] Commit message is clear and descriptive

---

## Documentation

### When to Document

- **New features** → Create/update file in `docs/`
- **Bug fixes** → No doc required unless behavior changes
- **API changes** → Update relevant sections in `README.md` and `docs/`

### Documentation Structure

- One feature = one markdown file in `docs/`
- Use clear headings, code examples, and practical explanations
- Link to related docs where relevant
- Keep examples working and tested

---

## Git & Commits

### Before Committing

1. Run typecheck and tests
2. Review your changes: `git diff`
3. Verify no `.env` or credentials are included
4. Use meaningful commit messages

### Commit Message Format

```
<type>: <short description>

<optional detailed explanation>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Examples:**
```
feat: add multi-account rotation with round-robin scheduling
fix: handle token refresh edge case on 401 response
docs: add web search API usage guide
```

### What NOT to Commit

- `.env` or `.env.local` files
- `dist/` directory (generated)
- `node_modules/` (generated)
- `.qwen/` directory (user data)
- Auto-formatting changes (quote style, spacing fixes)

---

## Common Workflows

### Adding a Feature

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes in `src/`
3. Add documentation in `docs/` (if user-facing)
4. Run: `npm run typecheck && npm run build:core && npm run test:simple`
5. Submit PR with clear description

### Fixing a Bug

1. Create branch: `git checkout -b fix/your-bug`
2. Add a test case that reproduces the bug (if applicable)
3. Fix the bug
4. Run full test suite: `npm run test`
5. Submit PR with before/after behavior description

### Updating Documentation

1. Edit relevant file in `docs/`
2. If user-facing, update `README.md` too
3. No build/test needed for docs-only changes
4. Submit PR

---

## Project Structure Overview

```
qwen-code-oai-proxy/
├── src/
│   ├── cli/                    # CLI commands & TUI
│   ├── server/                 # HTTP server & endpoints
│   ├── qwen/                   # Qwen API client & auth
│   ├── utils/                  # Logging, token counting, etc.
│   └── types/                  # TypeScript type definitions
├── docs/                       # Feature documentation
├── scripts/                    # Build & test scripts
├── spec/                       # Test data
├── README.md                   # Main user guide
├── CHANGELOG.md                # Feature history
├── package.json                # Dependencies & npm scripts
└── tsconfig.json               # TypeScript config
```

---

## Getting Help

- **Project overview**: See `README.md`
- **Architecture**: Read `docs/codebase_analysis.md`
- **Feature details**: Check `docs/` folder
- **Issues/discussions**: GitHub issues & discussions

---

## Code of Conduct

- Be respectful and constructive
- Assume good intent
- Provide detailed feedback in reviews
- Welcome diverse perspectives

---

## Questions?

Open a GitHub issue or start a discussion. We're happy to help!

Happy coding 🚀
