"use strict";

/**
 * Cross-platform entry for sync_agent_ai_prompts.py (Python 3).
 * Root npm "build" must not hard-require `python` on PATH to be the only name:
 * Linux/macOS often use `python3`; Windows may use `py -3`.
 *
 * Node-only environments (e.g. slim Docker images): set
 *   MERGETONIC_SKIP_PROMPT_SYNC=1
 * when agent prompt copies are already synced (e.g. committed).
 */

const { spawnSync } = require("node:child_process");
const path = require("node:path");

if (process.env.MERGETONIC_SKIP_PROMPT_SYNC === "1") {
  console.warn("mergetonic: skipping sync-agent-ai-prompts (MERGETONIC_SKIP_PROMPT_SYNC=1)");
  process.exit(0);
}

const script = path.join(__dirname, "sync_agent_ai_prompts.py");

/** @returns {readonly [string, string[]][]} */
function candidates() {
  if (process.platform === "win32") {
    return [
      ["python", [script]],
      ["python3", [script]],
      ["py", ["-3", script]],
    ];
  }
  return [
    ["python3", [script]],
    ["python", [script]],
  ];
}

for (const [exe, args] of candidates()) {
  const r = spawnSync(exe, args, { stdio: "inherit" });
  if (r.status === 0) {
    process.exit(0);
  }
  if (r.error && r.error.code === "ENOENT") {
    continue;
  }
  if (r.status !== null && r.status !== 0) {
    process.exit(r.status);
  }
}

console.error(
  "mergetonic: could not run scripts/sync_agent_ai_prompts.py — install Python 3 or set MERGETONIC_SKIP_PROMPT_SYNC=1 if prompts are already synced.",
);
process.exit(1);
