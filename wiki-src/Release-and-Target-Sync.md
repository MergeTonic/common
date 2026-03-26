# Release and Target Sync

This page summarizes release orchestration and target-repo propagation from `release-targets.json`.

## Key points

- `release-targets.json` is the routing source of truth.
- `target-repo-templates/<target-id>/` overlays are target-owned and applied during sync.
- Release orchestrator supports `monorepo-only`, `target-sync-pr`, and `full-release`.
- Wiki publish is independent from target sync and should be monitored separately.

## Operations guide

Detailed operator guidance is maintained in `docs/mono-to-target-release.md`.
