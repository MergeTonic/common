import test from "node:test";
import assert from "node:assert/strict";

import { resolveHydrationConfig } from "../hydration/hydrationConfig";
import { runQuestionRefinement } from "../hydration/questionRefinement";

test("question refinement mode off copies intents without LLM", async () => {
  const cfg = resolveHydrationConfig(undefined, {}, { questionMode: "off" });
  const r = await runQuestionRefinement({
    mode: "off",
    config: cfg,
    leftIntent: "L",
    rightIntent: "R",
    conflictRegionsJson: "[]",
    repoStructureExcerpt: "",
    env: {},
  });
  assert.equal(r.kind, "artifact");
  if (r.kind === "artifact") {
    assert.equal(r.artifact.mode, "off");
    assert.equal(r.artifact.refined_left_intent, "L");
    assert.equal(r.artifact.refined_right_intent, "R");
    assert.equal(r.skippedLlm, true);
  }
});

test("question refinement context_digest_sha256 includes pass-2 retrieval JSON", async () => {
  const cfg = resolveHydrationConfig(undefined, {}, { questionMode: "off" });
  const base = {
    mode: "off" as const,
    config: cfg,
    leftIntent: "L",
    rightIntent: "R",
    conflictRegionsJson: "[]",
    repoStructureExcerpt: "src/",
    env: {},
  };
  const a = await runQuestionRefinement({
    ...base,
    retrievalHitsPreR1Json: "[]",
    retrievalHitsPass2Json: "[]",
  });
  const b = await runQuestionRefinement({
    ...base,
    retrievalHitsPreR1Json: "[]",
    retrievalHitsPass2Json: JSON.stringify([{ chunk_id: "c1", score: 1, text: "hit", metadata: {} }]),
  });
  assert.equal(a.kind, "artifact");
  assert.equal(b.kind, "artifact");
  if (a.kind === "artifact" && b.kind === "artifact") {
    assert.ok(a.artifact.context_digest_sha256);
    assert.ok(b.artifact.context_digest_sha256);
    assert.notEqual(a.artifact.context_digest_sha256, b.artifact.context_digest_sha256);
  }
});
