import test from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

import { resolveIntentBootstrap } from "../hydration/intentBootstrap";

test("resolveIntentBootstrap prefers CLI flags over empty profile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ib-"));
  const art = resolveIntentBootstrap({
    repoRoot: dir,
    leftIntentFlag: "keep tests",
    rightIntentFlag: "ship fast",
    env: {},
    userQuery: "focus on API",
    followUp: "also tests",
  });
  assert.equal(art.left_intent, "keep tests");
  assert.equal(art.right_intent, "ship fast");
  assert.equal(art.schema, "tonic-hydration-intent-bootstrap");
  assert.ok(art.rendered_excerpt?.includes("focus on API"));
  assert.ok(art.rendered_excerpt?.includes("also tests"));
});
