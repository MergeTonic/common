## Developpers

From the repository root:

```bash
npm ci
npm run build
npm test
```

Workspace packages: `@mergetonic/core`, `merge-conflict-resolver`, `@mergetonic/github-agent`.

## Quick start

### Python core (`merge-tonic`)

```bash
pip install -e "./merge-tonic-lib[dev]"
python -m pytest merge-tonic-lib/tests -v
```

### TypeScript core (`@mergetonic/core`)

```bash
npm ci
pip install -e "./merge-tonic-lib[dev]"   # required for TS <-> Python parity tests
npm run test -w @mergetonic/core
npm run build -w @mergetonic/core
```

CLI `merge-tonic` (TypeScript via `npx`; Python console script from PyPI package `merge-tonic`):

```bash
npx --yes @mergetonic/core merge --left path/to/left.txt --right path/to/right.txt
npx --yes @mergetonic/core m -l path/to/left.txt -r path/to/right.txt
npx --yes @mergetonic/core report --left L.txt --right R.txt --out report.json
npx --yes @mergetonic/core r L.txt R.txt -p demo.txt
pip install mergetonic && merge-tonic merge --left L.txt --right R.txt
merge-tonic a conflicted.txt
merge-tonic git --repo . compare --left-ref HEAD~1 --right-ref HEAD --dry-run
merge-tonic git --repo . merge --ref main
merge-tonic g m main
merge-tonic g wt add ../wt main
merge-tonic git --repo . from-index --write
```

Subcommands include `merge`, `apply`, `conflicts`, `report`, `git` (`fetch`, `compare`, `materialize`, `from-index`, `merge`, `worktree`), and `github ref create` (needs `GITHUB_TOKEN`). Top-level aliases (`m`,`a`,`c`,`r`,`g`) and git aliases (`f`,`mat`,`fi`,`m`,`wt`) are supported across Python/TS CLIs, along with short flags and positional marker-optional forms where unambiguous. The first argument may be `merge-tonic`, `tonic-merge`, or `mt` for compatibility/shorthand. You can also use `python -m tonic.cli ...` with an editable or sdist install.

Branch-oriented marker flow example (while on `dev`):

```bash
git checkout dev
merge-tonic git --repo . merge --ref main --no-commit
merge-tonic git --repo . from-index --write
```

### Agent (Python)

```bash
pip install -e "./merge-tonic-lib[dev]"
pip install -e "./agents/github-action-agent[dev]"
python -m pytest agents/github-action-agent/tests -v
```

### Agent (Node)

```bash
npm ci
npm run build -w @mergetonic/core
npm run test -w @mergetonic/github-agent
```

### Extension

```bash
npm ci
npm run build -w @mergetonic/core
npm run compile -w merge-conflict-resolver
npm run test -w merge-conflict-resolver
```

## Git hooks (extension bundle pre-commit)

Hooks live under [`.githooks/`](../.githooks/) . Point Git at them once per clone (local config only):

```bash
git config --local core.hooksPath .githooks
```

Or run [`scripts/setup-git-hooks.sh`](../scripts/setup-git-hooks.sh) on Unix, or [`scripts/setup-git-hooks.ps1`](../scripts/setup-git-hooks.ps1) on Windows PowerShell.

When you stage files that affect the VS Code extension bundle (for example `packages/tonic-core/src/**`, `extensions/tonic-conflict-resolver/src/**`, root `package.json` / `package-lock.json`, or the esbuild / verify scripts listed in `.githooks/pre-commit`), **`pre-commit`** runs:

1. `node scripts/verify-extension-bundle.cjs` — valid `extension.js` / `extension.js.map` pairing and map shape.
2. `node scripts/verify-extension-bundle-fresh.cjs` — recompiles the extension and fails if `extensions/tonic-conflict-resolver/out/extension.js` or `.map` would change (committed output must match sources).

If the hook blocks your commit, run `npm run compile -w merge-conflict-resolver`, re-stage `extensions/tonic-conflict-resolver/out/extension.js` and `extension.js.map`, and commit again. CI (extension workflow) enforces the same fresh-bundle check.

## Prompt authoring (hydration vs conflict)

- Files under `prompts/hydration/` use **doubled** braces for variables: `{{var_name}}` (runtime `applyHydrationTemplate` in `@mergetonic/core`). Unknown keys stay literal in the output.
- Files under `prompts/conflict/` are merged into the agent bundle as **single**-brace `{var}` strings for Python `.format()` / Node `formatTpl`. Do not mix conventions in one template pipeline.
- After editing any `prompts/**/*.md`, run `python scripts/generate_prompt_bundle.py` and `npm run sync-agent-ai-prompts` so embeds and agent JSON stay aligned.