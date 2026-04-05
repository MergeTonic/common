# GitHub Agent Python

## What it is

Python GitHub Action agent for PR merge visualization, optional LLM hydration, optional **ast-grep / full hydrate** when enabled in the workflow, and review comments.

## Install / run locally

```bash
pip install mergetonic-github-agent
# Console script: tonic-agent
```

The primary integration path is the composite action: **`agents/github-action-agent/action.yml`**.

## Version source

`agents/github-action-agent/pyproject.toml`

## Repo links

- Monorepo source: **`agents/github-action-agent/`**
- Package README: **`agents/github-action-agent/README.md`**

## Runtime notes

- Default **`merge_engine=git`**: isolated worktree merge, new run PR — see [[GitHub-Agents-Runtime]].
- Depends on **`mergetonic`** for merge/hydration behavior; prompt bundle synced from **`agents/shared-tonic-ai-prompts/`**.
- Fork PRs can restrict token permissions for inline review comments.
