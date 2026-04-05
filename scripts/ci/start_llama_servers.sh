#!/usr/bin/env bash
# Start one or two llama-server processes for CI or local stacks; wait for OpenAI-compatible /v1/health.
#
# Optional fetch (set to download before start):
#   LLAMA_RELEASE_ZIP_URL   — URL to llama.cpp release .zip (Linux x64); extracts llama-server into LLAMA_BIN_DIR
#
# Required to start anything:
#   LLAMA_SERVER_BIN        — path to llama-server executable (after fetch or from cache)
#
# Pattern A — single server (chat + embeddings, no --embeddings):
#   LLAMA_SINGLE_MODEL      — path to one .gguf
#   LLAMA_SINGLE_PORT       — default 8080
#
# Pattern B — two servers:
#   LLAMA_EMBED_MODEL       — embedding-capable .gguf; served with --embeddings
#   LLAMA_EMBED_PORT        — default 8080
#   LLAMA_CHAT_MODEL        — optional second .gguf (instruct); no --embeddings
#   LLAMA_CHAT_PORT         — default 8081
#
# Common:
#   LLAMA_NGL               — GPU layers; default 0 (CPU)
#   LLAMA_CTX               — context size; default 512
#   LLAMA_PID_FILE          — where to append PIDs (default /tmp/llama-ci-pids.txt)
#
# If LLAMA_SERVER_BIN is unset and LLAMA_RELEASE_ZIP_URL is unset, exits 0 (no-op) so callers can always invoke this step.

set -euo pipefail

LLAMA_BIN_DIR="${LLAMA_BIN_DIR:-${RUNNER_TEMP:-/tmp}/llama-bin}"
LLAMA_PID_FILE="${LLAMA_PID_FILE:-/tmp/llama-ci-pids.txt}"
LLAMA_NGL="${LLAMA_NGL:-0}"
LLAMA_CTX="${LLAMA_CTX:-512}"
: >"$LLAMA_PID_FILE"

wait_health() {
  local url=$1
  local name=$2
  local max="${LLAMA_HEALTH_RETRIES:-60}"
  local i=0
  while (( i < max )); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo "start_llama_servers: $name healthy at $url"
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  echo "start_llama_servers: timeout waiting for $name ($url)" >&2
  return 1
}

if [[ -z "${LLAMA_SERVER_BIN:-}" && -n "${LLAMA_RELEASE_ZIP_URL:-}" ]]; then
  mkdir -p "$LLAMA_BIN_DIR"
  zip_path="${LLAMA_BIN_DIR}/llama-release.zip"
  echo "start_llama_servers: downloading $LLAMA_RELEASE_ZIP_URL"
  curl -fsSL "$LLAMA_RELEASE_ZIP_URL" -o "$zip_path"
  unzip -o -j "$zip_path" "*/llama-server" -d "$LLAMA_BIN_DIR" 2>/dev/null || unzip -o -j "$zip_path" "llama-server" -d "$LLAMA_BIN_DIR"
  chmod +x "$LLAMA_BIN_DIR/llama-server"
  export LLAMA_SERVER_BIN="$LLAMA_BIN_DIR/llama-server"
fi

if [[ -z "${LLAMA_SERVER_BIN:-}" ]]; then
  if [[ "${START_LLAMA_STRICT:-}" == "1" ]]; then
    echo "start_llama_servers: START_LLAMA_STRICT=1 but LLAMA_SERVER_BIN missing (set LLAMA_RELEASE_ZIP_URL to fetch)." >&2
    exit 1
  fi
  echo "start_llama_servers: LLAMA_SERVER_BIN unset (and no LLAMA_RELEASE_ZIP_URL); skipping."
  exit 0
fi

if [[ ! -x "$LLAMA_SERVER_BIN" ]]; then
  echo "start_llama_servers: not executable: $LLAMA_SERVER_BIN" >&2
  exit 1
fi

start_bg() {
  local name=$1
  shift
  echo "start_llama_servers: starting $name: $*"
  nohup "$@" >>"${RUNNER_TEMP:-/tmp}/llama-${name}.log" 2>&1 &
  echo $! >>"$LLAMA_PID_FILE"
}

if [[ -n "${LLAMA_SINGLE_MODEL:-}" ]]; then
  port="${LLAMA_SINGLE_PORT:-8080}"
  start_bg single "$LLAMA_SERVER_BIN" -m "$LLAMA_SINGLE_MODEL" --port "$port" -ngl "$LLAMA_NGL" -c "$LLAMA_CTX"
  wait_health "http://127.0.0.1:${port}/v1/health" "single"
  exit 0
fi

if [[ -n "${LLAMA_EMBED_MODEL:-}" ]]; then
  eport="${LLAMA_EMBED_PORT:-8080}"
  start_bg embed "$LLAMA_SERVER_BIN" -m "$LLAMA_EMBED_MODEL" --embeddings --port "$eport" -ngl "$LLAMA_NGL" -c "$LLAMA_CTX"
  wait_health "http://127.0.0.1:${eport}/v1/health" "embed"
fi

if [[ -n "${LLAMA_CHAT_MODEL:-}" ]]; then
  cport="${LLAMA_CHAT_PORT:-8081}"
  start_bg chat "$LLAMA_SERVER_BIN" -m "$LLAMA_CHAT_MODEL" --port "$cport" -ngl "$LLAMA_NGL" -c "$LLAMA_CTX"
  wait_health "http://127.0.0.1:${cport}/v1/health" "chat"
fi

if [[ -z "${LLAMA_EMBED_MODEL:-}" && -z "${LLAMA_CHAT_MODEL:-}" ]]; then
  echo "start_llama_servers: set LLAMA_SINGLE_MODEL or LLAMA_EMBED_MODEL / LLAMA_CHAT_MODEL to start servers." >&2
  exit 1
fi
