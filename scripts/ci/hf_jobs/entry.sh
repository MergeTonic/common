#!/usr/bin/env bash
# Generic HF Jobs mirror: clone GIT_CLONE_URL at GIT_REF, then run repo checks (Node + Python weave tests).
# Shallow clone is OK for branch tips; for arbitrary SHAs, use full clone or fetch with increasing depth until rev-parse succeeds.
set -euo pipefail

: "${GIT_CLONE_URL:?Set GIT_CLONE_URL (https git remote)}"
: "${GIT_REF:=main}"

ROOT="${HF_JOB_WORKDIR:-/workspace/repo}"
mkdir -p "$(dirname "$ROOT")"

if git clone --depth 1 --branch "$GIT_REF" "$GIT_CLONE_URL" "$ROOT" 2>/dev/null; then
  :
else
  git clone "$GIT_CLONE_URL" "$ROOT"
  cd "$ROOT"
  git fetch --depth 1 origin "$GIT_REF" || git fetch origin "$GIT_REF"
  git checkout "$GIT_REF"
  cd - >/dev/null
fi

cd "$ROOT"

echo "Checked out $(git rev-parse HEAD) at $ROOT"

if [[ -f package.json ]]; then
  npm ci
  npm run build -w @mergetonic/core
  npm run build -w @mergetonic/hf-weave 2>/dev/null || true
  if [[ -d packages/tonic-core/src ]]; then
    if grep -RIn huggingface packages/tonic-core/src; then
      echo "unexpected huggingface string in packages/tonic-core/src"
      exit 1
    fi
  fi
fi

if [[ -d merge-tonic-lib ]]; then
  pip install -e "merge-tonic-lib[dev]"
  pytest merge-tonic-lib/tests -q --tb=short -k "weave or hf_weave or hub" || pytest merge-tonic-lib/tests -q --tb=short
fi

echo "hf_jobs entry: ok"
