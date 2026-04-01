# Clean-Home Test Checks

These checks simulate a brand-new machine by overriding `HOME` with a temporary directory.

Why this matters:
- the proxy stores auth files in `~/.qwen`
- runtime usage data lives under `~/.local/share/qwen-proxy`
- many first-run bugs only show up when those paths do not exist yet

## How it works

The test scripts create a temp directory under `/tmp` and run the compiled CLI/runtime with:
- `HOME=<temp dir>`
- `USERPROFILE=<temp dir>`

That gives the process an isolated home directory without touching your real auth or usage files.

## Useful commands

Run the clean-home auth probe:

```bash
npm run test:auth-clean-home
```

Run the first-run storage/bootstrap regression:

```bash
npm run test:first-run
```

Run the packaged install smoke test:

```bash
npm run test:install-smoke
```

Run the full validation set:

```bash
npm test
```

## When to use each one

- `test:auth-clean-home` --> checks a new machine with no `~/.qwen` does not spam warnings
- `test:first-run` --> checks SQLite/db bootstrap works in a clean home
- `test:install-smoke` --> checks the packed npm artifact installs, boots, responds to `/health`, and stops

Use the dedicated scripts instead of ad-hoc `node -e` commands unless you are doing a one-off debug probe.
