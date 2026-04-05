# GitHub Agent Node

## What it is

Node GitHub Action agent for PR merge visualization, optional LLM hydration, optional **ast-grep / full hydrate** when enabled in the workflow, and review comments.

## Install / run locally

```bash
npm install @mergetonic/github-agent
# Bins: merge-tonic-github-agent, mergetonic-github-agent
```

The primary integration path is the composite action: **`agents/github-action-agent-node/action.yml`**.

## Version source

`agents/github-action-agent-node/package.json`

## Repo links

- Monorepo source: **`agents/github-action-agent-node/`**
- Package README: **`agents/github-action-agent-node/README.md`**

## Runtime notes

- Default **`merge_engine=git`**: isolated worktree merge, new run PR, comments on that PR — see [[GitHub-Agents-Runtime]].
- Optional ast hydration installs **`@ast-grep/cli`** and forwards hydrate flags / env (Chroma, embeddings) from action inputs.
- Requires GitHub token scopes for PR comments and optional checks; fork PRs may restrict inline review comments.
