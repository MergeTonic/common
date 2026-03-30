# Merge.tonic

## Tonic PR agent vs. `git merge`

The GitHub agents now default to a **git-native** path: they run isolated `git merge --no-commit` in a temporary worktree and parse real merge markers into Tonic `annotated_lines` for reporting/comments. In isolated mode the agent also pushes a fresh run branch and opens a fresh PR, then publishes comments/checks against that new PR context. You can still opt into the legacy **API** path (`merge_engine=api`), which hydrates base/head via the compare/contents APIs and runs Tonic's two-snapshot weave (`mergeSnapshots`). See [`docs/tonic-git-merge-pipeline.md`](docs/tonic-git-merge-pipeline.md) for mode details and operational caveats.

## Publishable composite actions

Each of [`agents/github-action-agent`](agents/github-action-agent/) (Python + `merge-tonic`) and [`agents/github-action-agent-node`](agents/github-action-agent-node/) (Node + `@mergetonic/core`) is a single composite action: hydrate -> merge -> `merge-tonic-report` JSON (with `annotated_lines` on conflicted files) -> PR summary/file/inline comments with deterministic prefer-head suggestions (`suggestion` fences when line counts match). Optional: `enable_ai` (OpenAI-compatible env), `enable_checks` (GitHub Check + annotations). Use Python or Node depending on runtime preference; behavior is aligned.

Operator copy-paste: [`docs/tonic-pr-agent-consumer.md`](docs/tonic-pr-agent-consumer.md).

## License

Unless otherwise noted in per-package metadata, this repository and the publishable packages (Python `mergetonic`, npm `@mergetonic/core`, VS Code extension `merge-conflict-resolver`, and the GitHub agents) are under **GNU GPL-2.0-only**. See the `LICENSE` file in the repository root and in each published package directory.

The `merge-tonic` / `mergetonic` CLI requires a one-time acceptance step (`merge-tonic accept-license`) before other subcommands run, unless `MERGETONIC_LICENSE_ACCEPTED=1` is set (for automation and tests).

Multi-product workspace:

| Product | Path | Role |
| -------- | ------ | ------ |
| **Python core** | [`merge-tonic-lib/`](merge-tonic-lib/) | PyPI package `merge-tonic` - CRDT weave merge engine and conflict markers |
| **TypeScript core** | [`packages/tonic-core/`](packages/tonic-core/) | npm package `@mergetonic/core` - same API and tests + Python parity gate |
| **GitHub agent (Python)** | [`agents/github-action-agent/`](agents/github-action-agent/) | PR comments, optional AI |
| **GitHub agent (Node)** | [`agents/github-action-agent-node/`](agents/github-action-agent-node/) | Same merge + comment path via `@mergetonic/core` |
| **VS Code / Cursor extension** | [`extensions/tonic-conflict-resolver/`](extensions/tonic-conflict-resolver/) | Highlights Tonic markers, CodeLens, conflict tree; bundles `@mergetonic/core` |

Canonical wiki pages:

- Home: `https://github.com/mergetonic/common/wiki`
- TypeScript core (`tsmt`): `https://github.com/mergetonic/common/wiki/Core-TS-%40mergetonic-core`
- Python core (`mtpy`): `https://github.com/mergetonic/common/wiki/Core-Python-mergetonic`
- GitHub agent Node (`js-action`): `https://github.com/mergetonic/common/wiki/GitHub-Agent-Node`
- GitHub agent Python (`py-action`): `https://github.com/mergetonic/common/wiki/GitHub-Agent-Python`
- VS Code extension (`vsmt`): `https://github.com/mergetonic/common/wiki/VSCode-Extension`

## Monorepo (npm workspaces)

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
merge-tonic git --repo . hydrate-intents --check-optional-ai --out-json hydration-check.json
```

Subcommands include `merge`, `apply`, `conflicts`, `report`, `git` (`fetch`, `compare`, `materialize`, `from-index`, `merge`, `worktree`), and `github ref create` (needs `GITHUB_TOKEN`). Top-level aliases (`m`,`a`,`c`,`r`,`g`) and git aliases (`f`,`mat`,`fi`,`m`,`wt`) are supported across Python/TS CLIs, along with short flags and positional marker-optional forms where unambiguous. The first argument may be `merge-tonic`, `tonic-merge`, or `mt` for compatibility/shorthand. You can also use `python -m tonic.cli ...` with an editable or sdist install.

Hydration Chroma pinning and readiness contract: [docs/hydration-chroma-runtime.md](docs/hydration-chroma-runtime.md).

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
