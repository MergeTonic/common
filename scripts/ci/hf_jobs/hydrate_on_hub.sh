#!/usr/bin/env bash
# Hydrate-on-Hub: clone any remote + ref, optional Chroma, run Python hydrate (Inference-friendly defaults behind env flags).
set -euo pipefail

: "${MERGETONIC_LICENSE_ACCEPTED:=1}"
export MERGETONIC_LICENSE_ACCEPTED

REPO_ID_LEGACY="${TONIC_HF_HYDRATE_REPO:-}"
if [[ -z "${GIT_CLONE_URL:-}" && -n "$REPO_ID_LEGACY" ]]; then
  export GIT_CLONE_URL="https://huggingface.co/${REPO_ID_LEGACY}.git"
fi
: "${GIT_CLONE_URL:?Set GIT_CLONE_URL or TONIC_HF_HYDRATE_REPO}"
: "${GIT_REF:=${TONIC_HF_HYDRATE_REF:-main}}"

ROOT="${HF_JOB_WORKDIR:-/workspace/repo}"
mkdir -p "$(dirname "$ROOT")"

clone_shallow() {
  git clone --depth 1 --branch "$GIT_REF" "$GIT_CLONE_URL" "$ROOT"
}

if ! clone_shallow 2>/dev/null; then
  git clone "$GIT_CLONE_URL" "$ROOT"
  cd "$ROOT"
  git fetch --depth 1 origin "$GIT_REF" || git fetch origin "$GIT_REF"
  git checkout "$GIT_REF"
  cd - >/dev/null
fi

cd "$ROOT"

CHROMA_URL="${TONIC_CHROMA_URL:-http://127.0.0.1:8000}"
if [[ "${TONIC_HYDRATE_JOB_MINIMAL:-0}" != "1" ]]; then
  if command -v chroma >/dev/null 2>&1; then
    chroma run --host 127.0.0.1 --port 8000 --path "${TONIC_CHROMA_DATA_DIR:-/tmp/chroma-data}" &
    CH_PID=$!
    for _ in $(seq 1 30); do
      curl -sf "$CHROMA_URL/api/v1/heartbeat" >/dev/null 2>&1 && break
      sleep 1
    done
    export TONIC_CHROMA_URL="$CHROMA_URL"
    export TONIC_RETRIEVAL_BACKEND="${TONIC_RETRIEVAL_BACKEND:-chroma}"
  fi
fi

# Defaults: enable hf_inference only when explicitly requested (avoids surprise billing).
if [[ "${TONIC_HF_JOBS_DEFAULT_INFERENCE:-0}" == "1" ]]; then
  export TONIC_LLM_BACKEND="${TONIC_LLM_BACKEND:-hf_inference}"
  export TONIC_EMBEDDING_BACKEND="${TONIC_EMBEDDING_BACKEND:-hf_inference}"
fi

EXTRA=( )
if [[ -f .tonic/jobs/hydrate.argv ]]; then
  # shellcheck disable=SC2207
  EXTRA=( $(tr '\n' ' ' < .tonic/jobs/hydrate.argv) )
fi
if [[ -n "${TONIC_HYDRATE_JOB_ARGV:-}" ]]; then
  # shellcheck disable=SC2206
  EXTRA+=( $TONIC_HYDRATE_JOB_ARGV )
fi

OUT="${HF_JOB_ARTIFACT_DIR:-${TONIC_HYDRATE_OUT:-$ROOT/.tonic/jobs/hydrate-out}}"
mkdir -p "$OUT"

pip install -e "./merge-tonic-lib" 2>/dev/null || pip install merge-tonic 2>/dev/null || true

python -m tonic.cli hydrate --repo "$ROOT" --out-dir "$OUT" "${EXTRA[@]}" "$@"

if [[ -n "${CH_PID:-}" ]]; then
  kill "$CH_PID" 2>/dev/null || true
fi

echo "hydrate_on_hub: wrote artifacts under $OUT"
