# Architecture and parity

## Architecture

Tonic uses deterministic **two-snapshot weaving** (CRDT-style) for merge and conflict output. Optional layers add **Git-native conflict parsing**, **weave manifests** under `.tonic/weave/`, and a **multi-phase hydration pipeline** (ast-grep, LLM refinement, retrieval, code-walk).

## Monorepo layout (runtime surfaces)

| Area | Path | Role |
|------|------|------|
| Python core | `merge-tonic-lib/` | `mergetonic` package: merge engine, git helpers, hydration, ast-grep hydrate |
| TypeScript core | `packages/tonic-core/` | `@mergetonic/core`: parity CLI and libraries |
| Coding / retrieval helpers | `packages/tonic-coding-hydration/` | Shared TS retrieval + code-search agent helpers used by hydrate |
| HF Weave satellite | `packages/hf-weave/`, `packages/hf-weave-py/` | Hub sync, doctor, CLI extensions |
| JSON schemas | `schemas/` | Contract for reports, hydration artifacts, weave, repo profile |
| GitHub agents | `agents/github-action-agent/`, `agents/github-action-agent-node/` | PR workflows, optional ast hydration |
| VS Code extension | `extensions/tonic-conflict-resolver/` | Conflict marker UX |
| Shared agent prompts | `agents/shared-tonic-ai-prompts/prompts.v1.json` | Generated from `prompts/` markdown; synced into both agents |

## Parity model

- **Python ↔ TypeScript core:** same CLI shape (`merge-tonic` / `mergetonic` / `mt` / `tonic-merge`); CI runs parity tests and golden fixtures across both.
- **Agents:** align on merge report schema, comment strategy, and **prompt bundle** content (see [[Contributing-Docs]]).
- **Hydration:** stage order, exit codes, and artifact schemas are shared; implementations live in parallel trees (`tonic/hydration_*` vs `packages/tonic-core/src/hydration/`).

## Related wiki pages

- [[Hydration-Pipeline]] — ast-grep hydrate, full hydrate, schemas
- [[HF-Weave]] — weave verify/sync/replay and Hub
- [[Repo-Profile]] — `.tonic/repo.json` composite commands
- [[GitHub-Agents-Runtime]] — `merge_engine` git vs api, tokens, ast hydration
