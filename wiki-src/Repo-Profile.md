# Repo profile and composite CLI

Use **`merge-tonic repo`** (TypeScript or Python) with **`.tonic/repo.json`** (schema **`tonic-repo-profile`** v1 in `schemas/tonic-repo-profile.v1.json`) so fetch → compare → hydrate reuse one profile instead of repeating flags.

## Typical flow

1. **`merge-tonic repo init --repo .`** — `.tonic/` layout, idempotent weave stub manifest, `repo.json`.
2. **`merge-tonic repo init --remote origin --left-ref main --right-ref feature --fetch`** — optional `--canonical-ref` for three-way defaults.
3. **`merge-tonic repo fetch`** — `git fetch` for every non-empty ref in the profile (plus extra `--branch` / `--ref`).
4. **`merge-tonic repo compare --merge-branch feature`** or explicit **`--left-ref` / `--right-ref`** — delegates to **`merge-tonic git compare`** with profile defaults.
5. **`merge-tonic repo hydrate`** — hydration pipeline with profile defaults for `--repo`, `--out-dir`, `--intent-profile`, `--intent-pair` when omitted.

## Related git commands

- **`merge-tonic git compare-three`** (alias **`c3`**) — merge-base three-way via `git merge-file`; **`merge-tonic repo compare-three`** fills **`--base-ref`** from profile **`canonical_ref`** when set.
- **`merge-tonic weave replay`** — both runtimes; `--steps-json`, `--path`, optional checkpoints / JSON summary.
- **`merge-tonic repo resolve <spec>`** — classify a path, GitHub URL, or Hugging Face repo id → JSON.

## Hub and weave

- **`--hub-prefetch`** on **`git compare`** / **`compare-three`** with profile **`hub_repo_id`** prefetches weave blobs into `.tonic/weave/blobs/` when **`HF_TOKEN`** and repo id allow.
- **`--weave-merge`** on **`git compare`** merges serialized weave states when blobs exist at each ref; may degrade with **`TONIC_WEAVE_COMPARE_DEGRADED`** if blobs are missing.
- **`merge-tonic repo init --hub-create --hub-repo-id NAMESPACE/MODEL`** — creates Hub model repo, writes `.tonic/hf-repo.json`, syncs **`hub_repo_id`** into `repo.json`.

See [[HF-Weave]] for verify, sync, and Hub index details.
