import test from "node:test";
import assert from "node:assert/strict";
import { buildHydratedConflictPrompt } from "../promptTemplates";

test("buildHydratedConflictPrompt includes Cursor @file context when requested", () => {
  const prompt = buildHydratedConflictPrompt({
    workspaceRelativePath: "src/main.ts",
    conflictKind: "added both",
    leftHunk: "left",
    rightHunk: "right",
    contextFormat: "cursor",
  });
  assert.match(prompt, /Context file \(Cursor\): @src\/main\.ts/);
  assert.doesNotMatch(prompt, /Context file \(VS Code\): #src\/main\.ts/);
});

test("buildHydratedConflictPrompt includes VS Code #file context when requested", () => {
  const prompt = buildHydratedConflictPrompt({
    workspaceRelativePath: "src/main.ts",
    conflictKind: "added both",
    leftHunk: "left",
    rightHunk: "right",
    contextFormat: "vscode",
  });
  assert.match(prompt, /Context file \(VS Code\): #src\/main\.ts/);
  assert.doesNotMatch(prompt, /Context file \(Cursor\): @src\/main\.ts/);
});

test("buildHydratedConflictPrompt includes both context forms and line range", () => {
  const prompt = buildHydratedConflictPrompt({
    workspaceRelativePath: "src/main.ts",
    conflictKind: "added both",
    leftHunk: "left",
    rightHunk: "right",
    contextFormat: "both",
    conflictStartLine: 10,
    conflictEndLine: 22,
  });
  assert.match(prompt, /Context file \(Cursor\): @src\/main\.ts/);
  assert.match(prompt, /Context file \(VS Code\): #src\/main\.ts/);
  assert.match(prompt, /Conflict range \(1-based lines\): 10-22/);
});
