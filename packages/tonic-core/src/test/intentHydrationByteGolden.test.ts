import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import type { AstHydrationArtifactV1 } from "../astGrep/types";
import { buildIntentHydration } from "../hydration/buildIntentHydration";

const goldenPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "merge-tonic-lib",
  "tests",
  "fixtures",
  "intent_hydration_byte_golden.min.json",
);

const richGoldenPath = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "merge-tonic-lib",
  "tests",
  "fixtures",
  "intent_hydration_byte_golden_rich.min.json",
);

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(stableStringify).join(",")}]`;
  }
  const rec = obj as Record<string, unknown>;
  const keys = Object.keys(rec)
    .filter((k) => rec[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(rec[k])}`).join(",")}}`;
}

test("buildIntentHydration matches Python byte golden fixture", () => {
  const expectedRaw = fs.readFileSync(goldenPath, "utf8").trim();
  const expectedParsed = JSON.parse(expectedRaw) as unknown;
  const out = buildIntentHydration({
    bootstrap: {
      schema: "tonic-hydration-intent-bootstrap",
      version: "1",
      left_intent: "L",
      right_intent: "R",
      sources: {},
    },
    refinement: null,
    conflicts: {
      schema: "tonic-conflict-context",
      version: "1",
      scan_scope: "none",
      conflict_regions: [],
    },
    ast: null,
    astPath: "",
    conflictPath: "",
  });
  assert.equal(stableStringify(out), stableStringify(expectedParsed));
});

test("buildIntentHydration rich evidence_links byte golden (sorted keys)", () => {
  const expectedRaw = fs.readFileSync(richGoldenPath, "utf8").trim();
  const expectedParsed = JSON.parse(expectedRaw) as unknown;
  const out = buildIntentHydration({
    bootstrap: {
      schema: "tonic-hydration-intent-bootstrap",
      version: "1",
      left_intent: "L",
      right_intent: "R",
      sources: {},
    },
    refinement: null,
    conflicts: {
      schema: "tonic-conflict-context",
      version: "1",
      scan_scope: "full",
      conflict_regions: [
        { path: "z.ts", region_id: "c1", start_line: 1, end_line: 2, mid_line: 1 },
      ],
    },
    ast: {
      matches: [
        {
          path: "a.ts",
          rule_id: "rule-a",
          severity: "warning",
          language: "typescript",
          message: "m",
          meta: {},
          start: { line: 1, column: 0 },
          end: { line: 2, column: 0 },
        },
      ],
    } as unknown as AstHydrationArtifactV1,
    astPath: "",
    conflictPath: "",
    retrieval: {
      artifactPath: "x",
      hits: [
        {
          chunk_id: "h1",
          text: "t",
          score: 0.5,
          metadata: { path: "b.ts", start_line: 1, end_line: 2 },
        },
      ],
    },
  });
  assert.equal(stableStringify(out), stableStringify(expectedParsed));
});
