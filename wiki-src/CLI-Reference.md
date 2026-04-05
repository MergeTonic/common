# CLI reference

Both **`@mergetonic/core`** and **`mergetonic`** install the same logical CLI. **Entry binary names:** `merge-tonic`, `mergetonic`, `mt`, `tonic-merge` (see each package manifest for the exact list).

**License gate:** non-interactive use may require `MERGETONIC_LICENSE_ACCEPTED=1` or a prior **`merge-tonic accept-license`** (GPL-2.0-only).

## Quick examples

```bash
# TypeScript (npx or local install)
npx --yes @mergetonic/core merge --left L.txt --right R.txt
npx --yes @mergetonic/core report --left L.txt --right R.txt --out report.json

# Python
pip install mergetonic
merge-tonic merge --left L.txt --right R.txt
merge-tonic report --left L.txt --right R.txt --out report.json
```

## Top-level commands

| Command | Notes |
|---------|--------|
| `help` / `-h` / `--help` | Usage |
| `accept-license` | Record GPL acceptance |
| `merge` | Two-file merge (`--left`/`--right`) or branch helper: `merge <base-ref> <target-branch> [--repo]` |
| `apply` | Heuristic resolve Tonic markers (`--file`, `--write`, `--sidecar`, `--report`) |
| `conflicts` | Parse Tonic markers → JSON (`--file` or stdin) |
| `report` | Emit merge report JSON for two files |
| `ast-grep-hydrate` / `agh` | Ast-grep scan → hydration artifacts ([[Hydration-Pipeline]]) |
| `hydrate` / `h` | Full hydration pipeline ([[Hydration-Pipeline]]) |
| `git` | See **Git subcommands** below |
| `weave` / `w` | See **Weave subcommands** below ([[HF-Weave]]) |
| `repo` | Profile-driven init/fetch/compare/hydrate/resolve ([[Repo-Profile]]) |
| `github` | `github ref create` (needs `GITHUB_TOKEN`, `GITHUB_REPOSITORY` or `--repo`) |

## `merge-tonic git` subcommands

| Subcommand | Role |
|------------|------|
| `fetch` | `git fetch` wrapper |
| `compare` | Tonic merge diff between two refs (optional `--weave-merge`, `--hub-prefetch`, …) |
| `compare-three` / `c3` | Three-way `git merge-file` per changed path |
| `materialize` / `from-index` | Unmerged index → Tonic markers |
| `merge` | `git merge --no-ff` / `--no-commit` |
| `hydrate-intents` | Interactive intents or ast-grep passthrough |
| `worktree` | `add` \| `list` \| `remove` |

## `merge-tonic weave` subcommands

| Subcommand | Role |
|------------|------|
| `verify` | Manifest + blob checks |
| `replay` | Deterministic replay / CTRD |
| `inspect` / `extract` / `splice` | Row ↔ visible line tooling |
| `sync` | Hub-oriented sync when HF Weave package installed |
| `install-hooks` / `init` / `doctor` / `push` / `pull` | Git + Hub workflow helpers |

Full flags: **`merge-tonic weave --help`** and **`merge-tonic hydrate --help`** in a checkout.
