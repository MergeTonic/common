import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { updateState } from "../core";
import { pathEntryForFile, serializeManifestJson } from "../weaveGit/manifest";
import type { TonicGitManifest } from "../weaveGit/types";
import {
  persistCheckpointWeaveBlob,
  replaySteps,
  stateHash,
  verifyReplayMatchesManifest,
  type ReplayStep,
} from "../weaveGit/replay";

test("replay matches manifest hash", () => {
  const lines1 = ["x"];
  const st = updateState("", lines1, "c1");
  const lines2 = ["x", "y"];
  const st2 = updateState(st, lines2, "c2");
  const text = `${lines2.join("\n")}\n`;
  const [, entry] = pathEntryForFile({
    relPath: "p",
    textCanonical: text,
    serializedWeave: st2,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
  });
  const man: TonicGitManifest = {
    schema: "tonic-git-manifest",
    version: "1",
    commit: "head",
    paths: { p: entry },
  };
  const raw = serializeManifestJson(man);
  const steps: ReplayStep[] = [
    { commit: "c1", lines: lines1 },
    { commit: "c2", lines: lines2 },
  ];
  assert.ok(verifyReplayMatchesManifest(raw, "p", steps));
});

test("checkpoint persist writes blobs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mt-wr-"));
  const weaveRoot = path.join(root, "weave");
  const steps: ReplayStep[] = [
    { commit: "c1", lines: ["a"] },
    { commit: "c2", lines: ["a", "b"] },
  ];
  replaySteps(steps, {
    checkpointEvery: 1,
    onCheckpoint: (_c, ser) => {
      persistCheckpointWeaveBlob(weaveRoot, ser);
    },
  });
  const blobs = fs.readdirSync(path.join(weaveRoot, "blobs"));
  assert.ok(blobs.length >= 1);
});

test("stateHash stable", () => {
  const h = stateHash("x");
  assert.match(h, /^[0-9a-f]{64}$/);
});

test("replay tombstone chain matches chained update", () => {
  let st = updateState("", ["a", "b"]);
  st = updateState(st, ["b"], "c2");
  const steps: ReplayStep[] = [
    { commit: "c1", lines: ["a", "b"] },
    { commit: "c2", lines: ["b"] },
  ];
  const { finalSerialized } = replaySteps(steps);
  assert.equal(finalSerialized, st);
  assert.equal(stateHash(finalSerialized), stateHash(st));
});

test("replay duplicate line content stable", () => {
  let st = updateState("", ["same", "same"], "a");
  st = updateState(st, ["same", "between", "same"], "b");
  const steps: ReplayStep[] = [
    { commit: "a", lines: ["same", "same"] },
    { commit: "b", lines: ["same", "between", "same"] },
  ];
  assert.equal(replaySteps(steps).finalSerialized, st);
});

test("replay single step matches update from empty", () => {
  const steps: ReplayStep[] = [{ commit: "c1", lines: ["only"] }];
  assert.equal(replaySteps(steps).finalSerialized, updateState("", ["only"], "c1"));
});
