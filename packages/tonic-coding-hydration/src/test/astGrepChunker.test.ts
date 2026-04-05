import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { chunkFileAstGrep, chunksFromAstArtifact } from "../chunker/astGrepChunker";

test("chunkFileAstGrep extracts lines for match span", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-chunk-"));
  const rel = "sample.ts";
  fs.writeFileSync(path.join(dir, rel), "line1\nline2\nline3\n", "utf8");
  const matches = [
    {
      path: rel,
      rule_id: "r1",
      start: { line: 1, column: 0 },
      end: { line: 2, column: 0 },
    },
  ];
  const chunks = chunkFileAstGrep(dir, rel, matches);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0]!.text, /line1/);
  assert.match(chunks[0]!.text, /line2/);
});

test("chunksFromAstArtifact stable path order", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-chunk2-"));
  fs.writeFileSync(path.join(dir, "b.ts"), "a\n", "utf8");
  fs.writeFileSync(path.join(dir, "a.ts"), "z\n", "utf8");
  const matches = [
    { path: "b.ts", rule_id: "x", start: { line: 1 } },
    { path: "a.ts", rule_id: "y", start: { line: 1 } },
  ];
  const chunks = chunksFromAstArtifact(dir, matches);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]!.path, "a.ts");
  assert.equal(chunks[1]!.path, "b.ts");
});
