import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { initialState } from "../core";
import { pathEntryForFile, serializeManifestJson } from "../weaveGit/manifest";
import { weaveBlobPath } from "../weaveGit/verify";
import { runWeaveFromArgv, runWeaveSyncFromArgv, type WeaveSyncInject } from "../weaveCli";

test("weave doctor exits 0", async () => {
  assert.equal(await runWeaveFromArgv(["doctor"]), 0);
});

test("weave install-hooks writes four hook files", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-hooks-"));
  spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  const code = await runWeaveFromArgv(["install-hooks", "--repo", dir, "--mergetonic-cmd", "merge-tonic"]);
  assert.equal(code, 0);
  const hooks = path.join(dir, ".git", "hooks");
  for (const name of ["pre-commit", "pre-push", "post-merge", "post-checkout"]) {
    assert.ok(fs.existsSync(path.join(hooks, name)), `missing ${name}`);
  }
});

test("weave inspect --weave-file prints JSON", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-inspect-"));
  const st = initialState(["hello"]);
  const wf = path.join(dir, "w.txt");
  fs.writeFileSync(wf, st, "utf8");
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const code = await runWeaveFromArgv(["inspect", "--repo", dir, "--weave-file", wf]);
    assert.equal(code, 0);
    const data = JSON.parse(logs.join("\n")) as { rows: unknown[]; visible_to_weave: number[] };
    assert.ok(Array.isArray(data.rows));
    assert.deepEqual(data.visible_to_weave, [0]);
  } finally {
    console.log = orig;
  }
});

test("weave sync --dry-run without publish exits 0", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-sync-"));
  const code = await runWeaveFromArgv(["sync", "--repo", dir, "--dry-run"]);
  assert.equal(code, 0);
});

test("weave push exits 1 when blobs exist but HF_TOKEN missing (Hub online)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-push-auth-"));
  const blobs = path.join(dir, ".tonic", "weave", "blobs");
  fs.mkdirSync(blobs, { recursive: true });
  fs.writeFileSync(path.join(blobs, "a".repeat(64)), "x");
  fs.writeFileSync(path.join(dir, ".tonic", "hf-repo.json"), JSON.stringify({ repo_id: "org/model" }));
  const savedT = process.env.HF_TOKEN;
  const savedO = process.env.HF_HUB_OFFLINE;
  delete process.env.HF_TOKEN;
  delete process.env.HF_HUB_OFFLINE;
  try {
    const code = await runWeaveFromArgv(["push", "--repo", dir]);
    assert.equal(code, 1);
  } finally {
    if (savedT !== undefined) process.env.HF_TOKEN = savedT;
    else delete process.env.HF_TOKEN;
    if (savedO !== undefined) process.env.HF_HUB_OFFLINE = savedO;
    else delete process.env.HF_HUB_OFFLINE;
  }
});

test("weave sync runs publish/replay then blob push then index refresh in order", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-sync-order-"));
  const order: string[] = [];
  const inject: WeaveSyncInject = {
    runReplay: async () => {
      order.push("replay");
      return 0;
    },
    hub: {
      hubWeaveOffline: () => false,
      hubPushLocalWeaveBlobs: async () => {
        order.push("push");
        return 0;
      },
      refreshWeaveHubIndex: async () => {
        order.push("index");
        return {};
      },
    },
  };
  const argv = [
    "sync",
    "--repo",
    dir,
    "--publish-ctrd",
    "--replay-path",
    "p",
    "--update-index",
    "--repo-id",
    "org/model",
  ];
  const code = await runWeaveSyncFromArgv(argv, dir, inject);
  assert.equal(code, 0);
  assert.deepEqual(order, ["replay", "push", "index"]);
});

test("weave sync exits 1 when blobs exist but HF_TOKEN missing (Hub online)", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-sync-auth-"));
  const blobs = path.join(dir, ".tonic", "weave", "blobs");
  fs.mkdirSync(blobs, { recursive: true });
  fs.writeFileSync(path.join(blobs, "b".repeat(64)), "y");
  fs.writeFileSync(path.join(dir, ".tonic", "hf-repo.json"), JSON.stringify({ repo_id: "org/model" }));
  const savedT = process.env.HF_TOKEN;
  const savedO = process.env.HF_HUB_OFFLINE;
  delete process.env.HF_TOKEN;
  delete process.env.HF_HUB_OFFLINE;
  try {
    const code = await runWeaveFromArgv(["sync", "--repo", dir]);
    assert.equal(code, 1);
  } finally {
    if (savedT !== undefined) process.env.HF_TOKEN = savedT;
    else delete process.env.HF_TOKEN;
    if (savedO !== undefined) process.env.HF_HUB_OFFLINE = savedO;
    else delete process.env.HF_HUB_OFFLINE;
  }
});

test("weave verify --json happy path", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "weave-verify-"));
  const wr = path.join(dir, ".tonic", "weave");
  fs.mkdirSync(path.join(wr, "blobs"), { recursive: true });
  const lines = ["hello", "world"];
  const text = `${lines.join("\n")}\n`;
  fs.writeFileSync(path.join(dir, "doc.txt"), text, "utf8");
  const st = initialState(lines);
  const [, entry] = pathEntryForFile({
    relPath: "doc.txt",
    textCanonical: text,
    serializedWeave: st,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
  });
  fs.writeFileSync(weaveBlobPath(wr, entry.weave_serialized_sha), st, "utf8");
  const man = {
    schema: "tonic-git-manifest" as const,
    version: "1" as const,
    commit: "c0ffee",
    paths: { "doc.txt": entry },
  };
  fs.writeFileSync(path.join(wr, "manifest.json"), serializeManifestJson(man), "utf8");

  const logs: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    const code = await runWeaveFromArgv(["verify", "--repo", dir, "--json"]);
    assert.equal(code, 0);
    const report = JSON.parse(logs.join("\n")) as { status: string; schema: string };
    assert.equal(report.schema, "tonic-weave-verify-report");
    assert.equal(report.status, "ok");
  } finally {
    console.log = orig;
  }
});
