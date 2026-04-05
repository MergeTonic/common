import test from "node:test";
import assert from "node:assert/strict";

import { initialState, updateState } from "../core";
import {
  mergeDriverCompatibilityErrors,
  runOptionAMerge,
} from "../weaveGit/mergeDriver";
import { pathEntryForFile } from "../weaveGit/manifest";
import { stateHash } from "../weaveGit/replay";

test("runOptionAMerge full merge exit 0", () => {
  const base = ["a"];
  const sb = initialState(base);
  const so = sb;
  const st = updateState(sb, ["a", "c"], "c2");
  const r = runOptionAMerge({
    textBase: "a\n",
    textOurs: "a\n",
    textTheirs: "a\nc\n",
    loadStateOurs: () => so,
    loadStateTheirs: () => st,
    loadStateBase: () => sb,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    strict: true,
  });
  assert.equal(r.exitCode, 0);
  assert.ok(r.manifestEntry);
  assert.notEqual(r.manifestEntry?.degraded, true);
});

test("runOptionAMerge strict missing base fails", () => {
  const so = initialState(["x"]);
  const st = initialState(["y"]);
  const r = runOptionAMerge({
    textBase: "",
    textOurs: "x\n",
    textTheirs: "y\n",
    loadStateOurs: () => so,
    loadStateTheirs: () => st,
    loadStateBase: () => null,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    strict: true,
  });
  assert.equal(r.exitCode, 1);
});

test("runOptionAMerge non-strict degraded snapshot", () => {
  const so = initialState(["a"]);
  const st = initialState(["b"]);
  const r = runOptionAMerge({
    textBase: "",
    textOurs: "a\n",
    textTheirs: "b\n",
    loadStateOurs: () => so,
    loadStateTheirs: () => st,
    loadStateBase: () => null,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    strict: false,
  });
  assert.equal(r.exitCode, 1);
  assert.ok(r.manifestEntry?.degraded);
});

test("runOptionAMerge strict text weave mismatch", () => {
  const so = initialState(["a"]);
  const st = initialState(["b"]);
  const sb = initialState(["x"]);
  const r = runOptionAMerge({
    textBase: "x\n",
    textOurs: "z\n",
    textTheirs: "b\n",
    loadStateOurs: () => so,
    loadStateTheirs: () => st,
    loadStateBase: () => sb,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    strict: true,
  });
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.some((m) => m.includes("ours:") && m.includes("Git text")));
});

test("parent_weave_shas must include base", () => {
  const base = ["line"];
  const sb = initialState(base);
  const so = updateState(sb, ["line", "o"], "c1");
  const st = updateState(sb, ["line", "t"], "c2");
  const bsha = stateHash(sb);
  const [, eOurs] = pathEntryForFile({
    relPath: "f",
    textCanonical: "line\no\n",
    serializedWeave: so,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    parentWeaveShas: ["wrongnotbase"],
  });
  const [, eTheirs] = pathEntryForFile({
    relPath: "f",
    textCanonical: "line\nt\n",
    serializedWeave: st,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    parentWeaveShas: [bsha],
  });
  const [, eBaseRow] = pathEntryForFile({
    relPath: "f",
    textCanonical: "line\n",
    serializedWeave: sb,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
  });
  const r = runOptionAMerge({
    textBase: "line\n",
    textOurs: "line\no\n",
    textTheirs: "line\nt\n",
    loadStateOurs: () => so,
    loadStateTheirs: () => st,
    loadStateBase: () => sb,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    strict: true,
    manifestEntryBase: eBaseRow,
    manifestEntryOurs: eOurs,
    manifestEntryTheirs: eTheirs,
  });
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.some((m) => m.includes("parent_weave_shas")));
});

test("mergeDriverCompatibilityErrors empty when parent ok", () => {
  const base = ["line"];
  const sb = initialState(base);
  const so = updateState(sb, ["line", "o"], "c1");
  const st = updateState(sb, ["line", "t"], "c2");
  const bsha = stateHash(sb);
  const [, eBase] = pathEntryForFile({
    relPath: "f",
    textCanonical: "line\n",
    serializedWeave: sb,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
  });
  const [, eOurs] = pathEntryForFile({
    relPath: "f",
    textCanonical: "line\no\n",
    serializedWeave: so,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    parentWeaveShas: [bsha],
  });
  const [, eTheirs] = pathEntryForFile({
    relPath: "f",
    textCanonical: "line\nt\n",
    serializedWeave: st,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    parentWeaveShas: [bsha],
  });
  const err = mergeDriverCompatibilityErrors({
    textBase: "line\n",
    textOurs: "line\no\n",
    textTheirs: "line\nt\n",
    sBase: sb,
    sOurs: so,
    sTheirs: st,
    weaveFormatVersion: "1",
    diffEngineId: "tonic-v1",
    manifestEntryBase: eBase,
    manifestEntryOurs: eOurs,
    manifestEntryTheirs: eTheirs,
  });
  assert.deepEqual(err, []);
});
