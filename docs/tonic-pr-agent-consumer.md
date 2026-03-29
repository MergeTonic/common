# Tonic PR Agent Consumer Playbook

## Overview

The Tonic GitHub agents default to `merge_engine=git`. In this mode each run:

1. Captures immutable refs from the triggering PR.
2. Creates an isolated workspace and branch.
3. Hydrates conflicts via `git merge --no-commit` and emits Tonic `annotated_lines` with optional **author/intent** tags (`author_mode`, `intent_pair`, `author_alias_*`, `github_login_*` on both agents — see [`tonic-git-merge-pipeline.md`](./tonic-git-merge-pipeline.md)).
4. Pushes a fresh run branch and opens a fresh PR to the target base branch.
5. Publishes comments/checks against the newly created PR context.

## Required Token Scopes

- `contents: write` for run-branch push and marker branch updates.
- `pull-requests: write` for PR creation and review comments.
- `checks: write` when `enable_checks=true`.

## Recommended Workflow Inputs

```yaml
with:
  token: ${{ secrets.GITHUB_TOKEN }}
  merge_engine: git
  comment_mode: all
  verbosity: medium
  report_path: merge-tonic-report.json
  # optional git-merge marker hydration:
  # author_mode: base-head
  # intent_pair: preserve_base,prefer_head
```

`hydrate_mode` is only used when `merge_engine=api`.

## Rerun Semantics

- Each isolated run creates a distinct branch and PR.
- Comment upsert/dedupe is scoped to the created PR only.
- Prior run PRs are not mutated by subsequent runs.

## Troubleshooting

- **Missing immutable refs**: verify action bootstrap exports `TONIC_TARGET_BASE_SHA`, `TONIC_TARGET_HEAD_SHA`, and `TONIC_TARGET_BASE_BRANCH`.
- **Isolation errors**: ensure `TONIC_AGENT_ISOLATED_WORKSPACE` is set and differs from `GITHUB_WORKSPACE`.
- **PR creation failure**: verify token has `contents: write` and `pull-requests: write`.
- **Fork fetch issues**: use PR ref fallback (`refs/pull/<n>/head`) in bootstrap fetch.
