# Merge.tonic


## Monorepo workspace


| Product | Path | Role |
| -------- | ------ | ------ |
| **Python core** | [`merge-tonic-lib/`](merge-tonic-lib/) | PyPI package `merge-tonic` - CRDT weave merge engine and conflict markers |
| **TypeScript core** | [`packages/tonic-core/`](packages/tonic-core/) | npm package `@mergetonic/core` - same API and tests + Python parity gate |
| **GitHub agent (Python)** | [`agents/github-action-agent/`](agents/github-action-agent/) | PR comments, optional AI |
| **GitHub agent (Node)** | [`agents/github-action-agent-node/`](agents/github-action-agent-node/) | Same merge + comment path via `@mergetonic/core` |
| **VS Code / Cursor extension** | [`extensions/tonic-conflict-resolver/`](extensions/tonic-conflict-resolver/) | Highlights Tonic markers, CodeLens, conflict tree; bundles `@mergetonic/core` |

## Git hooks (extension bundle)

Tracked hooks live under [`.githooks/`](.githooks/). After cloning, point Git at them once (local config only):

```bash
git config --local core.hooksPath .githooks
```

On Unix you can run [`scripts/setup-git-hooks.sh`](scripts/setup-git-hooks.sh); on Windows PowerShell, [`scripts/setup-git-hooks.ps1`](scripts/setup-git-hooks.ps1).

`pre-commit` runs when staged paths affect the VS Code extension bundle (for example `packages/tonic-core/src/` or `extensions/tonic-conflict-resolver/src/`). It verifies `extension.js` / `extension.js.map` and rebuilds to ensure committed outputs are fresh. If a commit fails, run `npm run compile -w merge-conflict-resolver`, re-stage `extensions/tonic-conflict-resolver/out/extension.js` and `extension.js.map`, and try again. CI enforces the same check.

## Please Read the Docs :

- Home: `https://github.com/mergetonic/common/wiki`
- TypeScript core (`tsmt`): `https://github.com/mergetonic/common/wiki/Core-TS-%40mergetonic-core`
- Python core (`mtpy`): `https://github.com/mergetonic/common/wiki/Core-Python-mergetonic`
- GitHub agent Node (`js-action`): `https://github.com/mergetonic/common/wiki/GitHub-Agent-Node`
- GitHub agent Python (`py-action`): `https://github.com/mergetonic/common/wiki/GitHub-Agent-Python`
- VS Code extension (`vsmt`): `https://github.com/mergetonic/common/wiki/VSCode-Extension`
- HF Weave (`hf-weave`): in-repo guide [`docs/tonic-hf-weave.md`](docs/tonic-hf-weave.md) (wiki page to be linked after first publish)

## Publishable composite actions

Each of [`agents/github-action-agent`](agents/github-action-agent/) (Python + `merge-tonic`) and [`agents/github-action-agent-node`](agents/github-action-agent-node/) (Node + `@mergetonic/core`) is a single composite action: hydrate -> merge -> `merge-tonic-report` JSON (with `annotated_lines` on conflicted files) -> PR summary/file/inline comments with deterministic prefer-head suggestions (`suggestion` fences when line counts match). Optional: `enable_ai` (OpenAI-compatible env), `enable_checks` (GitHub Check + annotations). Use Python or Node depending on runtime preference; behavior is aligned.

Operator copy-paste: [`docs/tonic-pr-agent-consumer.md`](docs/tonic-pr-agent-consumer.md).


