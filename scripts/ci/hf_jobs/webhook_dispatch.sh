#!/usr/bin/env bash
# Parse Hugging Face Jobs WEBHOOK_PAYLOAD JSON, set GIT_CLONE_URL / GIT_REF, then exec the HF Jobs entry script.
# Payload shapes differ by domain; this script only reads common fields defensively.
set -euo pipefail

: "${WEBHOOK_PAYLOAD:?Set WEBHOOK_PAYLOAD (JSON string from HF webhook)}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY_SCRIPT="${HF_JOBS_ENTRY_SCRIPT:-entry.sh}"

eval "$(python3 <<'PY'
import json
import os
import shlex

raw = os.environ.get("WEBHOOK_PAYLOAD", "{}")
try:
    p = json.loads(raw)
except Exception:
    p = {}

def _s(x):
    return x.strip() if isinstance(x, str) else ""

ref = _s(os.environ.get("GIT_REF", ""))
if not ref:
    r = p.get("ref")
    if isinstance(r, str) and r.startswith("refs/heads/"):
        ref = r[len("refs/heads/") :]
    elif isinstance(r, str) and r.startswith("refs/tags/"):
        ref = r[len("refs/tags/") :]
    elif isinstance(r, str):
        ref = r
    else:
        ref = _s(str(p.get("revision") or p.get("head") or "main")) or "main"

clone = _s(os.environ.get("GIT_CLONE_URL", ""))
if not clone:
    repo = p.get("repository")
    if isinstance(repo, dict):
        clone = _s(repo.get("clone_url") or repo.get("git_url") or "")
    if not clone:
        clone = _s(p.get("git_url") or p.get("clone_url") or "")

print(f"export GIT_REF={shlex.quote(ref)}")
print(f"export GIT_CLONE_URL={shlex.quote(clone)}")
PY
)"

if [[ -z "${GIT_CLONE_URL}" ]]; then
  echo "webhook_dispatch: could not derive GIT_CLONE_URL from WEBHOOK_PAYLOAD; set GIT_CLONE_URL explicitly" >&2
  exit 1
fi

exec "${SCRIPT_DIR}/${ENTRY_SCRIPT}"
