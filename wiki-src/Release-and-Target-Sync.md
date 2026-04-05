# Release and Target Sync

This page summarizes release orchestration and target-repo propagation from **`release-targets.json`** at the monorepo root.

## Key points

- **`release-targets.json`** is the routing source of truth for which downstream repos receive overlays.
- **`target-repo-templates/<target-id>/`** holds target-owned template overlays applied during sync.
- The **release orchestrator** workflow (see **`.github/workflows/release-orchestrator.yml`**) supports modes such as **`monorepo-only`**, **`target-sync-pr`**, and **`full-release`** (exact labels follow the workflow inputs).
- Wiki publish is independent from target sync; monitor wiki automation separately.

## Operator detail

For step-by-step release operations, read **`.github/workflows/release-orchestrator.yml`** and **`scripts/release/`** (for example **`collect_versions.py`**, **`validate_release_contracts.py`**) in this repository. There is no separate `docs/mono-to-target-release.md` in-tree; this wiki page and the workflow are the references.
