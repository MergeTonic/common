import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { ctrdIdFromPayload } from "../ctrd";

function assertFixtureId(rel: string): void {
  const root = path.join(__dirname, "..", "..", "..", "..", "merge-tonic-lib", "tests", "fixtures", rel);
  const raw = fs.readFileSync(root, "utf8");
  const j = JSON.parse(raw) as { payload: Record<string, unknown>; ctrd_id: string };
  const got = ctrdIdFromPayload(j.payload);
  assert.equal(got, j.ctrd_id);
}

test("CTRD id matches Python golden fixture", () => {
  assertFixtureId("ctrd_golden.json");
});

test("CTRD id matches Python unicode golden fixture", () => {
  assertFixtureId("ctrd_golden_unicode.json");
});
