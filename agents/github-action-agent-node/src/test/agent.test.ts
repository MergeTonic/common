import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { mergeSnapshots, annotatedToConflictFile } from "@mergetonic/core";
import { buildSummaryBody, markerSummary } from "../githubComments";
import { loadImmutableTargets, resolvePrForAgent, writeActionOutputs } from "../index";
import { hydrateGitMerge } from "../hydrateGitMerge";
import { execFileSync } from "node:child_process";

function withPatchedEnv(
  patch: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const next = patch[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(patch)) {
      const old = prev[key];
      if (old === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = old;
      }
    }
  }
}

test("mergeSnapshots + conflict file", () => {
  const [merged, ann] = mergeSnapshots(["A"], ["A", "B"]);
  assert.ok(merged.includes("B"));
  assert.ok(Array.isArray(ann));
  const cf = annotatedToConflictFile("t.txt", ann);
  assert.equal(cf.path, "t.txt");
});

test("buildSummaryBody includes marker", () => {
  const body = buildSummaryBody("r1", "Hello", [{ path: "x" }], "medium");
  assert.ok(body.includes(markerSummary("r1")));
});

test("writeActionOutputs writes expected output keys", () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tonic-node-out-")), "gout.txt");
  const prev = process.env.GITHUB_OUTPUT;
  try {
    process.env.GITHUB_OUTPUT = out;
    writeActionOutputs({
      status: "ok",
      filesAnalyzed: 7,
      conflictedFiles: 3,
      reportPath: "merge-tonic-report.json",
    });
    const body = fs.readFileSync(out, "utf8");
    assert.match(body, /status=ok/);
    assert.match(body, /files_analyzed=7/);
    assert.match(body, /conflicted_files=3/);
    assert.match(body, /report_path=merge-tonic-report\.json/);
  } finally {
    process.env.GITHUB_OUTPUT = prev;
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test("hydrateGitMerge returns unmerged conflict file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-git-merge-"));
  const run = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    run(["init"]);
    run(["config", "user.email", "tonic@example.com"]);
    run(["config", "user.name", "Tonic Bot"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "A\nB\n", "utf8");
    run(["add", "a.txt"]);
    run(["commit", "-m", "base"]);
    const start = run(["rev-parse", "HEAD"]).trim();
    run(["checkout", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "A\nB-feature\n", "utf8");
    run(["commit", "-am", "feature"]);
    const head = run(["rev-parse", "HEAD"]).trim();
    run(["checkout", "-b", "base-branch", start]);
    fs.writeFileSync(path.join(dir, "a.txt"), "A\nB-base\n", "utf8");
    run(["commit", "-am", "base-change"]);
    const base = run(["rev-parse", "HEAD"]).trim();

    withPatchedEnv({ GITHUB_ACTIONS: "false" }, () => {
      const out = hydrateGitMerge({ workspace: dir, baseSha: base, headSha: head, maxFiles: 20 });
      assert.ok(out["a.txt"]);
      assert.equal(out["a.txt"]?.status, "unmerged");
      assert.ok((out["a.txt"]?.gitAnnotatedLines ?? []).some((l) => l.startsWith("<<<<<<< begin git merge")));
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hydrateGitMerge rejects mismatched isolated workspace", () => {
  const prev = process.env.TONIC_AGENT_ISOLATED_WORKSPACE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-git-merge-iso-"));
  try {
    process.env.TONIC_AGENT_ISOLATED_WORKSPACE = path.join(dir, "other");
    assert.throws(
      () => hydrateGitMerge({ workspace: dir, baseSha: "a", headSha: "b", maxFiles: 1 }),
      /workspace mismatch/,
    );
  } finally {
    if (prev == null) delete process.env.TONIC_AGENT_ISOLATED_WORKSPACE;
    else process.env.TONIC_AGENT_ISOLATED_WORKSPACE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hydrateGitMerge returns empty object on clean merge", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-git-clean-"));
  const run = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    run(["init"]);
    run(["config", "user.email", "tonic@example.com"]);
    run(["config", "user.name", "Tonic Bot"]);
    fs.writeFileSync(path.join(dir, "a.txt"), "A\n", "utf8");
    run(["add", "a.txt"]);
    run(["commit", "-m", "base"]);
    const base = run(["rev-parse", "HEAD"]).trim();
    run(["checkout", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "b.txt"), "B\n", "utf8");
    run(["add", "b.txt"]);
    run(["commit", "-m", "feature"]);
    const head = run(["rev-parse", "HEAD"]).trim();
    run(["checkout", "-b", "base-branch", base]);
    withPatchedEnv({ GITHUB_ACTIONS: "false" }, () => {
      const out = hydrateGitMerge({ workspace: dir, baseSha: base, headSha: head, maxFiles: 20 });
      assert.deepEqual(out, {});
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("hydrateGitMerge maxFiles applies to accepted conflicts only", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-git-maxfiles-"));
  const run = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    run(["init"]);
    run(["config", "user.email", "tonic@example.com"]);
    run(["config", "user.name", "Tonic Bot"]);
    fs.writeFileSync(path.join(dir, "a.png"), "x\n", "utf8");
    fs.writeFileSync(path.join(dir, "z.txt"), "x\n", "utf8");
    run(["add", "a.png", "z.txt"]);
    run(["commit", "-m", "base"]);
    const start = run(["rev-parse", "HEAD"]).trim();
    run(["checkout", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "a.png"), "feature\n", "utf8");
    fs.writeFileSync(path.join(dir, "z.txt"), "feature\n", "utf8");
    run(["commit", "-am", "feature"]);
    const head = run(["rev-parse", "HEAD"]).trim();
    run(["checkout", "-b", "base-branch", start]);
    fs.writeFileSync(path.join(dir, "a.png"), "base\n", "utf8");
    fs.writeFileSync(path.join(dir, "z.txt"), "base\n", "utf8");
    run(["commit", "-am", "base"]);
    const base = run(["rev-parse", "HEAD"]).trim();
    withPatchedEnv({ GITHUB_ACTIONS: "false" }, () => {
      const out = hydrateGitMerge({ workspace: dir, baseSha: base, headSha: head, maxFiles: 1 });
      assert.equal(Object.keys(out).length, 1);
      assert.ok(out["z.txt"]);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadImmutableTargets supports api-mode fallback from event payload", () => {
  const prevBase = process.env.TONIC_TARGET_BASE_SHA;
  const prevHead = process.env.TONIC_TARGET_HEAD_SHA;
  const prevBranch = process.env.TONIC_TARGET_BASE_BRANCH;
  try {
    delete process.env.TONIC_TARGET_BASE_SHA;
    delete process.env.TONIC_TARGET_HEAD_SHA;
    delete process.env.TONIC_TARGET_BASE_BRANCH;
    const out = loadImmutableTargets(
      {
        number: 42,
        base: { sha: "abc", ref: "main" },
        head: { sha: "def" },
      },
      { allowEventFallback: true },
    );
    assert.equal(out.sourcePrNumber, 42);
    assert.equal(out.baseSha, "abc");
    assert.equal(out.headSha, "def");
    assert.equal(out.baseBranch, "main");
  } finally {
    if (prevBase == null) delete process.env.TONIC_TARGET_BASE_SHA;
    else process.env.TONIC_TARGET_BASE_SHA = prevBase;
    if (prevHead == null) delete process.env.TONIC_TARGET_HEAD_SHA;
    else process.env.TONIC_TARGET_HEAD_SHA = prevHead;
    if (prevBranch == null) delete process.env.TONIC_TARGET_BASE_BRANCH;
    else process.env.TONIC_TARGET_BASE_BRANCH = prevBranch;
  }
});

test("loadImmutableTargets requires env contract in strict mode", () => {
  const prevBase = process.env.TONIC_TARGET_BASE_SHA;
  const prevHead = process.env.TONIC_TARGET_HEAD_SHA;
  const prevBranch = process.env.TONIC_TARGET_BASE_BRANCH;
  try {
    delete process.env.TONIC_TARGET_BASE_SHA;
    delete process.env.TONIC_TARGET_HEAD_SHA;
    delete process.env.TONIC_TARGET_BASE_BRANCH;
    assert.throws(
      () =>
        loadImmutableTargets(
          {
            number: 1,
            base: { sha: "abc", ref: "main" },
            head: { sha: "def" },
          },
          { allowEventFallback: false },
        ),
      /missing immutable target contract keys/,
    );
  } finally {
    if (prevBase == null) delete process.env.TONIC_TARGET_BASE_SHA;
    else process.env.TONIC_TARGET_BASE_SHA = prevBase;
    if (prevHead == null) delete process.env.TONIC_TARGET_HEAD_SHA;
    else process.env.TONIC_TARGET_HEAD_SHA = prevHead;
    if (prevBranch == null) delete process.env.TONIC_TARGET_BASE_BRANCH;
    else process.env.TONIC_TARGET_BASE_BRANCH = prevBranch;
  }
});

test("resolvePrForAgent prefers event.pull_request", async () => {
  const pr = { number: 11, title: "t" };
  const r = await resolvePrForAgent({ pull_request: pr }, "o", "n", "tok");
  assert.equal(r.number, 11);
});

test("resolvePrForAgent reads TONIC_PULL_REQUEST_JSON", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tonic-pr-json-"));
  const jp = path.join(dir, "pull.json");
  fs.writeFileSync(jp, JSON.stringify({ number: 22, title: "f" }));
  const prev = process.env.TONIC_PULL_REQUEST_JSON;
  process.env.TONIC_PULL_REQUEST_JSON = jp;
  try {
    const r = await resolvePrForAgent({}, "o", "n", undefined);
    assert.equal(r.number, 22);
  } finally {
    if (prev === undefined) {
      delete process.env.TONIC_PULL_REQUEST_JSON;
    } else {
      process.env.TONIC_PULL_REQUEST_JSON = prev;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
