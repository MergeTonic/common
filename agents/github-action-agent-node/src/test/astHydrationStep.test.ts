import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { hydrationOrchestrationArgvFromEnv, runAstHydrationStep } from "../astHydrationStep";

/**
 * Repo fixture used by agent ast-hydration tests (shared with Python `test_ast_hydration_step.py`).
 * Path from monorepo root: packages/tonic-core/src/test/fixtures/astGrep/fake-sg-success.js
 */
function fakeSgSuccessPath(): string {
  return path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "packages",
    "tonic-core",
    "src",
    "test",
    "fixtures",
    "astGrep",
    "fake-sg-success.js",
  );
}

/** Same directory; exits 2 for strict-mode tests. */
function fakeSgFailPath(): string {
  return path.resolve(path.dirname(fakeSgSuccessPath()), "fake-sg-fail.js");
}

test("ast hydration step is no-op when disabled", async () => {
  delete process.env.INPUT_ENABLE_AST_HYDRATION;
  const r = await runAstHydrationStep(process.cwd());
  assert.equal(r.exitCode, 0);
  assert.equal(r.mode, "skipped");
});

test("ast-grep-hydrate mode writes run artifact with fake sg via extra args", async (t) => {
  const fake = fakeSgSuccessPath();
  if (!fs.existsSync(fake)) {
    t.skip(`fixture missing (expected at repo path packages/tonic-core/src/test/fixtures/astGrep/fake-sg-success.js): ${fake}`);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agent-ast-"));
  const prevEnable = process.env.INPUT_ENABLE_AST_HYDRATION;
  const prevSub = process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
  const prevExtra = process.env.INPUT_AST_HYDRATION_EXTRA_ARGS;
  process.env.INPUT_ENABLE_AST_HYDRATION = "1";
  delete process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
  process.env.INPUT_AST_HYDRATION_EXTRA_ARGS = `--ast-grep-bin ${fake}`;
  try {
    const r = await runAstHydrationStep(dir);
    assert.equal(r.mode, "ast-grep-hydrate");
    assert.ok(r.runPath?.includes("hydration-run.json"));
    assert.ok(fs.existsSync(path.join(dir, ".tonic", "hydration-run.json")));
  } finally {
    if (prevEnable === undefined) {
      delete process.env.INPUT_ENABLE_AST_HYDRATION;
    } else {
      process.env.INPUT_ENABLE_AST_HYDRATION = prevEnable;
    }
    if (prevSub === undefined) {
      delete process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
    } else {
      process.env.INPUT_AST_HYDRATION_SUBCOMMAND = prevSub;
    }
    if (prevExtra === undefined) {
      delete process.env.INPUT_AST_HYDRATION_EXTRA_ARGS;
    } else {
      process.env.INPUT_AST_HYDRATION_EXTRA_ARGS = prevExtra;
    }
  }
});

test("INPUT_AST_HYDRATION_STRICT=1 throws when ast-grep exits non-zero", async (t) => {
  const fakeFail = fakeSgFailPath();
  if (!fs.existsSync(fakeFail)) {
    t.skip(`fixture missing: ${fakeFail}`);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agent-ast-strict-"));
  const prevEnable = process.env.INPUT_ENABLE_AST_HYDRATION;
  const prevSub = process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
  const prevExtra = process.env.INPUT_AST_HYDRATION_EXTRA_ARGS;
  const prevStrict = process.env.INPUT_AST_HYDRATION_STRICT;
  process.env.INPUT_ENABLE_AST_HYDRATION = "1";
  delete process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
  process.env.INPUT_AST_HYDRATION_EXTRA_ARGS = `--ast-grep-bin ${fakeFail}`;
  process.env.INPUT_AST_HYDRATION_STRICT = "1";
  try {
    await assert.rejects(() => runAstHydrationStep(dir), /ast-grep-hydrate failed with exit 12/);
  } finally {
    if (prevEnable === undefined) {
      delete process.env.INPUT_ENABLE_AST_HYDRATION;
    } else {
      process.env.INPUT_ENABLE_AST_HYDRATION = prevEnable;
    }
    if (prevSub === undefined) {
      delete process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
    } else {
      process.env.INPUT_AST_HYDRATION_SUBCOMMAND = prevSub;
    }
    if (prevExtra === undefined) {
      delete process.env.INPUT_AST_HYDRATION_EXTRA_ARGS;
    } else {
      process.env.INPUT_AST_HYDRATION_EXTRA_ARGS = prevExtra;
    }
    if (prevStrict === undefined) {
      delete process.env.INPUT_AST_HYDRATION_STRICT;
    } else {
      process.env.INPUT_AST_HYDRATION_STRICT = prevStrict;
    }
  }
});

test("hydrate subcommand runs pipeline and records intent path when tonic-core available", async (t) => {
  const fake = fakeSgSuccessPath();
  if (!fs.existsSync(fake)) {
    t.skip(`fixture missing (expected at repo path packages/tonic-core/src/test/fixtures/astGrep/fake-sg-success.js): ${fake}`);
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-agent-hyd-"));
  const prevEnable = process.env.INPUT_ENABLE_AST_HYDRATION;
  const prevSub = process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
  const prevExtra = process.env.INPUT_AST_HYDRATION_EXTRA_ARGS;
  process.env.INPUT_ENABLE_AST_HYDRATION = "1";
  process.env.INPUT_AST_HYDRATION_SUBCOMMAND = "hydrate";
  process.env.INPUT_AST_HYDRATION_EXTRA_ARGS = `--ast-grep-bin ${fake}`;
  process.env.INPUT_INTENT_PAIR = "left side,right side";
  try {
    const r = await runAstHydrationStep(dir);
    assert.equal(r.mode, "hydrate");
    assert.ok(r.intentHydrationPath);
    assert.ok(fs.existsSync(path.join(dir, ".tonic", "hydrate-out", "hydration-run.json")));
  } finally {
    if (prevEnable === undefined) {
      delete process.env.INPUT_ENABLE_AST_HYDRATION;
    } else {
      process.env.INPUT_ENABLE_AST_HYDRATION = prevEnable;
    }
    if (prevSub === undefined) {
      delete process.env.INPUT_AST_HYDRATION_SUBCOMMAND;
    } else {
      process.env.INPUT_AST_HYDRATION_SUBCOMMAND = prevSub;
    }
    if (prevExtra === undefined) {
      delete process.env.INPUT_AST_HYDRATION_EXTRA_ARGS;
    } else {
      process.env.INPUT_AST_HYDRATION_EXTRA_ARGS = prevExtra;
    }
    delete process.env.INPUT_INTENT_PAIR;
  }
});

test("hydrationOrchestrationArgvFromEnv maps INPUT_HYDRATION_* to CLI tokens", () => {
  const prevUq = process.env.INPUT_HYDRATION_USER_QUERY;
  const prevFu = process.env.INPUT_HYDRATION_FOLLOW_UP;
  const prevPr = process.env.INPUT_HYDRATION_PRIOR_RUN;
  process.env.INPUT_HYDRATION_USER_QUERY = "why merge";
  process.env.INPUT_HYDRATION_FOLLOW_UP = "also check tests";
  process.env.INPUT_HYDRATION_PRIOR_RUN = "/tmp/prior.json";
  try {
    const tok = hydrationOrchestrationArgvFromEnv();
    assert.deepEqual(tok, ["--user-query", "why merge", "--follow-up", "also check tests", "--prior-run", "/tmp/prior.json"]);
  } finally {
    if (prevUq === undefined) {
      delete process.env.INPUT_HYDRATION_USER_QUERY;
    } else {
      process.env.INPUT_HYDRATION_USER_QUERY = prevUq;
    }
    if (prevFu === undefined) {
      delete process.env.INPUT_HYDRATION_FOLLOW_UP;
    } else {
      process.env.INPUT_HYDRATION_FOLLOW_UP = prevFu;
    }
    if (prevPr === undefined) {
      delete process.env.INPUT_HYDRATION_PRIOR_RUN;
    } else {
      process.env.INPUT_HYDRATION_PRIOR_RUN = prevPr;
    }
  }
});
