# GitHub agents: runtime modes

Two first-party agents share behavior: **`agents/github-action-agent-node/`** (Node) and **`agents/github-action-agent/`** (Python). Inputs differ slightly per `action.yml`, but the merge/hydration model is the same.

## Merge engine

| `merge_engine` | Behavior |
|----------------|----------|
| **`git`** (default) | Real `git merge` in an **isolated worktree** from immutable base SHA; parse standard conflict markers; emit Tonic `annotated_lines` with optional author/intent tags; push run branch and open a **new PR** to the base branch; comments and checks target that **run PR**. |
| **`api`** | Compare API + snapshot weave path; publishes to the **source event PR** (no isolated run-PR orchestration). |

`hydrate_mode` applies when `merge_engine=api`, not for the default git-merge path.

## Git-merge pipeline (high level)

1. Checkout with full history (`fetch-depth: 0` in CI recipes).
2. Capture immutable refs (`base.sha`, `head.sha`, `base.ref`).
3. Isolated worktree + branch from base SHA.
4. `git merge --no-ff --no-commit <head_sha>`.
5. Parse unmerged paths → Tonic preview (optional **marker hydration**: `author_mode`, `intent_pair`, `author_alias_*`, `github_login_*` — see each action’s inputs).
6. Push run branch, open PR, repoint comment/check context to the run PR.

**Caveats:** slower than API mode on very large repos; each run creates a **new** run PR (no in-place mutation of older run PRs). Fork PRs remain subject to normal Actions token restrictions.

## Optional ast hydration

When **`enable_ast_hydration`** / related inputs are set, the composite actions can run the same **`merge-tonic hydrate`** / ast-grep stack as local CLI (including `ast_hydration_subcommand=hydrate`, `hydration_user_query`, `hydration_prior_run`, `ast_hydration_extra_args`, retrieval/Chroma env forwarded from inputs). They install **`@ast-grep/cli`** when ast hydration is enabled so `sg` is on `PATH`.

Multi-line operator text: prefer `ast_hydration_extra_args` or encoded newlines; argv is not shell-expanded.

## Token scopes (typical)

- **`contents: write`** — run-branch push
- **`pull-requests: write`** — PR creation, review comments
- **`checks: write`** — when `enable_checks=true`

## Packages and docs entry points

- Node: npm **`@mergetonic/github-agent`** (bins `merge-tonic-github-agent`, `mergetonic-github-agent`)
- Python: PyPI **`mergetonic-github-agent`**, console script **`tonic-agent`**

See also: [[GitHub-Agent-Node]], [[GitHub-Agent-Python]], [[Hydration-Pipeline]].
