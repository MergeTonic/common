# Tonic Git-Merge Pipeline

`git-merge` mode is the default runtime path for both GitHub agents (`merge_engine=git`).

## What it does

1. Checks out the repository with full history (`fetch-depth: 0`).
2. Captures immutable refs from the PR event (`base.sha`, `head.sha`, `base.ref`).
3. Creates an isolated worktree and branch from the immutable base SHA.
4. Runs `git merge --no-ff --no-commit <head_sha>` in the isolated worktree.
5. Reads unmerged files and parses standard Git conflict markers.
6. Converts parsed Git blocks to Tonic-style `annotated_lines` with optional **author/intent hydration** (per-side tags on `<<<<<<< begin` / `======= begin` lines), matching `@mergetonic/core` `gitConflictBlocksToTonicAnnotatedPreview`.
7. Commits run metadata on the isolated branch, pushes it, and opens a fresh PR to the immutable base branch.
8. Swaps publish context so summary/file/inline comments and checks post to the newly created PR head.

## Inputs

- `merge_engine=git` (default): real `git merge` in an isolated worktree.
- `merge_engine=api`: compare API + snapshot weave behavior; publishes comments/checks to the source event PR context (no isolated run-PR orchestration).

### Git-merge marker hydration (author / intent)

Both agents accept optional inputs (see each `action.yml`) that map to env vars:

| Env / input | Role |
|-------------|------|
| `INPUT_AUTHOR_MODE` | `base-head` (default), `human` (`git show` author name/email), or `ref` (use ref/sha token as tag) |
| `INPUT_AUTHOR_ALIAS_LEFT` / `INPUT_AUTHOR_ALIAS_RIGHT` | Explicit author tag overrides (highest precedence) |
| `INPUT_GITHUB_LOGIN_LEFT` / `INPUT_GITHUB_LOGIN_RIGHT` | Optional GitHub logins when not using `ref` mode |
| `INPUT_INTENT_PAIR` | Comma-separated `left,right` intent tags (defaults: `preserve_base`, `prefer_head`) |

CLI parity lives under `merge-tonic git compare` / `git materialize` in `@mergetonic/core` (`--author-mode`, `--intent-pair`, `--interactive-intents`, `--intent-profile`, etc.).

Report `conflict_regions` include `conflict_tags` (`author`, `intent`, `author_right`, `intent_right`) and optional `marker_label_begin` / `marker_label_mid` when begin and mid lines differ.

## Requirements and caveats

- Needs workflow token access to fetch repository refs.
- Needs token permissions to push run branch and create PR (`contents: write`, `pull-requests: write`).
- Best with `pull_request` workflows and least-privilege token scopes.
- Fork PR permissions still follow normal GitHub Actions restrictions.
- `git-merge` mode is slower than API hydration on large repositories.
- Idempotency/upsert is per target PR; each isolated run creates a new PR and does not mutate prior run PRs.
