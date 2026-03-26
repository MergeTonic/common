# Merge.tonic

## Tonic PR agent vs. `git merge`

The GitHub agents **do not** run `git merge` in a checkout. They use the **compare API** to fetch **base** and **head** file blobs per changed path, then run Tonic's two-snapshot weave (`mergeSnapshots`). That can differ from what Git shows after a failed merge. A future git-native workflow is sketched in [`docs/tonic-git-merge-pipeline.md`](docs/tonic-git-merge-pipeline.md).

## Publishable composite actions

Each of [`agents/github-action-agent`](agents/github-action-agent/) (Python + `merge-tonic`) and [`agents/github-action-agent-node`](agents/github-action-agent-node/) (Node + `@mergetonic/core`) is a single composite action: hydrate -> merge -> `merge-tonic-report` JSON (with `annotated_lines` on conflicted files) -> PR summary/file/inline comments with deterministic prefer-head suggestions (`suggestion` fences when line counts match). Optional: `enable_ai` (OpenAI-compatible env), `enable_checks` (GitHub Check + annotations). Use Python or Node depending on runtime preference; behavior is aligned.

Operator copy-paste: [`docs/tonic-pr-agent-consumer.md`](docs/tonic-pr-agent-consumer.md).

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

## CI

- `.github/workflows/ci-core.yml` - Python tests when `merge-tonic-lib/` changes
- `.github/workflows/ci-js-core.yml` - `@mergetonic/core` build + tests (includes Python parity)
- `.github/workflows/ci-agent.yml` - Python agent tests
- `.github/workflows/ci-agent-node.yml` - Node agent tests
- `.github/workflows/ci-extension.yml` - extension compile/test/VSIX dry-run
- `.github/workflows/detect-release-matrix.yml` - reusable changed-component matrix for release jobs
- `.github/workflows/sync-target-repos.yml` - sync selected monorepo components to target repos (`dry_run` + `sync_mode`)
- [`docs/tonic-pr-agent-consumer.md`](docs/tonic-pr-agent-consumer.md) - operator snippet for workflows
- `.github/workflows/publish-core.yml` - manual, itemized PyPI publish gate for `merge-tonic`
- `.github/workflows/publish-agent-pypi.yml` - manual, itemized PyPI publish gate for `mergetonic-github-agent`
- `.github/workflows/publish-npm.yml` - manual, itemized npm publish gate for `@mergetonic/core` (`NPM_TOKEN`)
- `.github/workflows/publish-agent-npm.yml` - manual, itemized npm publish gate for `@mergetonic/github-agent`
- `.github/workflows/publish-extension.yml` - manual VSIX package + optional Marketplace/OpenVSX publish
- `.github/workflows/release-contracts.yml` - validates release version contracts across packages/action manifests
- `.github/workflows/action-hydration-smoke.yml` - verifies action.yml hydration compatibility contracts

## Mono to target repo mapping

`release-targets.json` is the routing source of truth for monorepo-to-target sync:

- `vsmt` <= `extensions/tonic-conflict-resolver/**`
- `js-action` <= `agents/github-action-agent-node/**`
- `py-action` <= `agents/github-action-agent/**`
- `tsmt` <= `packages/tonic-core/**`
- `mtpy` <= `merge-tonic-lib/**`
- `.github` <= org/community/profile metadata paths

Target-specific README/workflow overlays live in `target-repo-templates/<target-id>/` and are applied during sync so downstream repos keep unique readmes and idiosyncratic publish workflows.

Operational details (secrets, manual launch matrix, rollout steps): [`docs/mono-to-target-release.md`](docs/mono-to-target-release.md).

Composite actions install from the workspace when `merge-tonic-lib/pyproject.toml` (Python) or `agents/github-action-agent-node/package.json` (Node) exists; otherwise they install pinned PyPI/npm versions (`tonic_version`, `tonic_github_agent_version` inputs).

## Documentation source of truth

- Authoritative docs are authored in this monorepo under `wiki-src/`.
- GitHub Wiki is the published reader surface and must be treated as mirror output.
- Direct edits in the wiki UI are unsupported; change docs via pull requests in `common`.
- Canonical page map is versioned in `wiki-src/_DocMap.json`.

## Wiki bootstrap status

- [ ] Default branch exists and is non-empty (`main`)
- [ ] Wiki feature enabled in repository settings
- [ ] Initial wiki page created (provisions `.wiki.git`)
- [ ] Preflight script passes: `python scripts/docs/wiki_preflight.py --repo mergetonic/common`
- [ ] Manual check workflow passes: `.github/workflows/wiki-bootstrap-check.yml`
- Runbook: [`docs/wiki-bootstrap.md`](docs/wiki-bootstrap.md)

## Layout note

Python sources live under [`merge-tonic-lib/tonic/`](merge-tonic-lib/tonic/).

The parity helper is [`merge-tonic-lib/tests/parity_gate.py`](merge-tonic-lib/tests/parity_gate.py); Node tests spawn it with `PYTHONPATH=merge-tonic-lib`.
