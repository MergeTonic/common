# Architecture and Parity

## Architecture

Tonic uses deterministic two-snapshot weaving for merge/conflict output.

## Runtime surfaces

- Python library: `merge-tonic-lib/`
- TypeScript library: `packages/tonic-core/`
- GitHub agents: `agents/github-action-agent/`, `agents/github-action-agent-node/`
- VS Code extension: `extensions/tonic-conflict-resolver/`

## Parity model

- Python and TypeScript cores share test vectors and parity checks.
- Agents align on report schema and comment strategy.
