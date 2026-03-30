import test from "node:test";
import assert from "node:assert/strict";
import type { ConflictFile, ConflictRegion } from "@mergetonic/core";
import {
  buildExpectedResolvedLineCountGuidance,
  buildConflictUserMessage,
  buildSystemPromptBody,
  determineFileType,
  githubJsonResponseSuffix,
  promptTemplateFromEnv,
} from "../promptEngineering";

test("determineFileType matches Python table", () => {
  assert.equal(determineFileType("x.rs"), "Rust");
  assert.equal(determineFileType("a.xyz"), "File with .xyz extension");
});

test("buildConflictUserMessage default template includes kind suffix and labels", () => {
  const cf: ConflictFile = {
    path: "t.py",
    conflicts: [],
    content: "",
    leftLabel: "alice",
    rightLabel: "bob",
  };
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "a",
    rightContent: "b",
    startLine: 1,
    endLine: 2,
    conflictKind: "added left",
  };
  const msg = buildConflictUserMessage(cf, reg, "default");
  assert.match(msg, /LEFT \(alice\):/);
  assert.match(msg, /RIGHT \(bob\):/);
  assert.match(msg, /\(added left\)/);
});

test("buildConflictUserMessage appends expected line count guidance only when provided", () => {
  const cf: ConflictFile = {
    path: "t.py",
    conflicts: [],
    content: "",
    leftLabel: "left",
    rightLabel: "right",
  };
  const reg: ConflictRegion = {
    baseContent: "",
    leftContent: "a",
    rightContent: "b",
    startLine: 4,
    endLine: 6,
    conflictKind: "added both",
  };
  const msg = buildConflictUserMessage(cf, reg, "enhanced", 3);
  assert.match(msg, /exactly 3 lines in resolved_lines/i);
  assert.equal(buildExpectedResolvedLineCountGuidance(undefined), "");
  assert.equal(buildExpectedResolvedLineCountGuidance(0), "");
});

test("githubJsonResponseSuffix mentions resolved_lines", () => {
  assert.match(githubJsonResponseSuffix(), /resolved_lines/);
});

test("buildSystemPromptBody enhanced mentions semantic", () => {
  assert.match(buildSystemPromptBody("enhanced").toLowerCase(), /semantic/);
});

test("promptTemplateFromEnv default enhanced when unset", () => {
  const tonic = process.env.TONIC_AGENT_PROMPT_TEMPLATE;
  const riz = process.env.RIZZLER_PROMPT_TEMPLATE;
  try {
    delete process.env.TONIC_AGENT_PROMPT_TEMPLATE;
    delete process.env.RIZZLER_PROMPT_TEMPLATE;
    assert.equal(promptTemplateFromEnv(), "enhanced");
    process.env.TONIC_AGENT_PROMPT_TEMPLATE = "default";
    assert.equal(promptTemplateFromEnv(), "default");
    process.env.TONIC_AGENT_PROMPT_TEMPLATE = "context-aware";
    assert.equal(promptTemplateFromEnv(), "context-aware");
  } finally {
    if (tonic === undefined) {
      delete process.env.TONIC_AGENT_PROMPT_TEMPLATE;
    } else {
      process.env.TONIC_AGENT_PROMPT_TEMPLATE = tonic;
    }
    if (riz === undefined) {
      delete process.env.RIZZLER_PROMPT_TEMPLATE;
    } else {
      process.env.RIZZLER_PROMPT_TEMPLATE = riz;
    }
  }
});
