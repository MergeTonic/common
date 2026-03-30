import test from "node:test";
import assert from "node:assert/strict";

import { buildHydrationAstCandidates } from "../hydration";

test("buildHydrationAstCandidates promotes declaration metadata into structured AST candidates", () => {
  const candidates = buildHydrationAstCandidates([
    {
      code: "export class AuthService {\n  resolve() {}\n}\n",
      filePath: "src/auth.ts",
      chunkId: "chunk-auth",
      source: "hybrid",
      score: 0.82,
      symbol: "AuthService",
      startLine: 1,
      endLine: 3,
    },
    {
      code: "export function resolveAuth(): boolean {\n  return true;\n}\n",
      filePath: "src/auth.ts",
      chunkId: "chunk-resolve",
      source: "symbol",
      score: 0.91,
      symbol: "resolveAuth",
      startLine: 5,
      endLine: 7,
    },
  ]);

  assert.ok(candidates.some((candidate) => candidate.ast_node_id === "module:src/auth.ts" && candidate.node_kind === "module"));
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.symbol === "AuthService"
        && candidate.node_kind === "class"
        && candidate.start_line === 1
        && candidate.end_line === 3,
    ),
  );
  assert.ok(
    candidates.some(
      (candidate) =>
        candidate.symbol === "resolveAuth"
        && candidate.rule_id === "symbol-search-v1"
        && candidate.node_kind === "function",
    ),
  );
});
