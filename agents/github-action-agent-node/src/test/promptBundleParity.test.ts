import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

/** Agent copies of shared-tonic-ai-prompts must stay byte-identical (see scripts/sync_agent_ai_prompts.py). */
test("Node and Python agent prompt bundles match", () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const nodeP = path.join(repoRoot, "agents", "github-action-agent-node", "src", "data", "aiPrompts.v1.json");
  const pyP = path.join(repoRoot, "agents", "github-action-agent", "src", "tonic_agent", "data", "ai_prompts.v1.json");
  const a = fs.readFileSync(nodeP, "utf8");
  const b = fs.readFileSync(pyP, "utf8");
  assert.equal(a, b);
});
