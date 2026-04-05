import test from "node:test";
import assert from "node:assert/strict";

import {
  applyHydrationTemplate,
  composeHydrationBodies,
  loadHydrationPromptBody,
  resetHydrationPromptCacheForTests,
} from "../hydration/hydrationPromptTemplate";

test("applyHydrationTemplate substitutes placeholders", () => {
  const s = applyHydrationTemplate("A {{left_intent}} B {{right_intent}}", {
    left_intent: "L",
    right_intent: "R",
  });
  assert.equal(s, "A L B R");
});

test("loadHydrationPromptBody reads packaged embed for known ids", () => {
  resetHydrationPromptCacheForTests();
  const improver = loadHydrationPromptBody("hydration.question_improver");
  assert.ok(improver && improver.includes("{{left_intent}}"));
  assert.ok(improver.includes("Left intent:"));
  const boot = loadHydrationPromptBody("hydration.intent_bootstrap");
  assert.ok(boot);
  assert.ok(boot!.includes("Honor both merge sides"));
});

test("applyHydrationTemplate leaves unknown {{keys}} unchanged", () => {
  const s = applyHydrationTemplate("x {{known}} y {{unknown}}", { known: "K" });
  assert.equal(s, "x K y {{unknown}}");
});

test("composeHydrationBodies joins loaded templates", () => {
  resetHydrationPromptCacheForTests();
  const sys = loadHydrationPromptBody("hydration.question_improver_system");
  const user = loadHydrationPromptBody("hydration.question_improver");
  const composed = composeHydrationBodies(["hydration.question_improver_system", "hydration.question_improver"]);
  assert.ok(sys && user);
  assert.ok(composed.includes(sys!.trim()));
  assert.ok(composed.includes(user!.trim()));
});
