# HF Weave (Git weave + optional Hub)

**HF Weave** is the satellite tier for Git-stored weave manifests, optional Hugging Face Hub transport, and strict verification. Core merge engines stay usable without Hub.

## Packages

| Surface | Install | Notes |
|---------|---------|--------|
| TypeScript library | `@mergetonic/hf-weave` | Peer: `@mergetonic/core`; enables `merge-tonic weave sync` / push / pull paths that delegate to the package |
| Python library | `mergetonic-hf-weave` (optional extra on `mergetonic`: `hf-weave`) | Forwards Python `merge-tonic weave sync` when installed |
| Core | `mergetonic` / `@mergetonic/core` | Local `merge-tonic weave verify` works with `.tonic/weave/blobs/<sha256>` |

## Git setup (typical)

- **`.gitattributes`**: e.g. `*.md filter=tonic-weave-clean merge=tonic-weave text eol=lf`
- **Refs:** fetch tonic notes and refs explicitly, e.g. `git fetch origin +refs/notes/tonic:refs/notes/tonic +refs/tonic/*:refs/tonic/*`

## CLI commands (core)

All via `merge-tonic weave` / `merge-tonic w`:

- **`verify`** — manifest + blob checks; `--staged`, `--strict`, `--json`
- **`replay`** — deterministic replay from `--steps-json`, `--trace-key`, or `--from-hub` (CTRD on Hub); optional `--publish-ctrd`
- **`inspect`**, **`extract`**, **`splice`** — weave row ↔ visible line tooling
- **`sync`** — when `@mergetonic/hf-weave` (Node) or `mergetonic-hf-weave` (Python) is installed: Hub upload / index refresh path (needs **`HF_TOKEN`** for writes when online)
- **`install-hooks`**, **`init`**, **`doctor`**, **`push`**, **`pull`**

Python-only convenience: **`hf weave sync`** / **`hf weave replay`** after installing the HF CLI extension entrypoints from `mergetonic-hf-weave`.

## Resolution ladder (verify / replay)

1. Manifest at HEAD: `.tonic/weave/manifest.json`
2. Local blobs: `.tonic/weave/blobs/{weave_serialized_sha}`
3. Hub blobs: `.tonic/hub/blobs/…` (prefetch / API; **`HF_TOKEN`** when private)
4. Hub weave index: `.tonic/hub/weave-index.v1.json`
5. **CTRD** (canonical trace replay descriptor): schema `tonic-weave-trace-replay.v1.json`, Hub path under `.tonic/hub/traces/`, linked from manifest via `replay_trace_key`

**CTRD id** is SHA-256 over canonical JSON (sorted keys, `ensure_ascii=False` semantics in Python reference tests). Do not assume ASCII-escaped JSON stringifies match that digest.

**Offline:** `HF_HUB_OFFLINE=1` and `TONIC_HF_WEAVE_OFFLINE=1` are treated equivalently for Hub I/O gates.

## CI caution

Fork PRs often lack a **`HF_TOKEN`** with write access to your Hub mirror. Use read-only verify, skip Hub upload steps on `pull_request` from forks, or scope secrets to non-fork workflows.

Repo invariants and merge-driver details may also be documented in `TONIC_GIT_INVARIANTS.md` at the monorepo root.
