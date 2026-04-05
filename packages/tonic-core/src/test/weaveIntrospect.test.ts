import test from "node:test";
import assert from "node:assert/strict";
import { deserializeState } from "../state";
import { currentLines, initialState, updateState } from "../core";
import {
  buildVisibleWeaveMaps,
  inspectRowsJson,
  splitWeaveIndexAfterVisible,
  visibleLineCount,
  visibleRangeToWeaveIndices,
  WeaveIntrospectError,
} from "../weaveIntrospect";

test("no tombstones mapping", () => {
  const raw = initialState(["a", "b", "c"]);
  const rows = deserializeState(raw);
  const { visibleToWeave } = buildVisibleWeaveMaps(rows);
  assert.equal(visibleLineCount(rows), 3);
  assert.deepEqual(visibleToWeave, [0, 1, 2]);
});

test("tombstone shifts visible index", () => {
  const s0 = initialState(["a", "b"]);
  const s1 = updateState(s0, ["b"], "c1");
  const rows = deserializeState(s1);
  assert.deepEqual(currentLines(s1), ["b"]);
  const { visibleToWeave, weaveToVisible } = buildVisibleWeaveMaps(rows);
  assert.deepEqual(visibleToWeave, [1]);
  assert.equal(weaveToVisible.get(1), 1);
  assert.ok(!weaveToVisible.has(0));
  assert.deepEqual(visibleRangeToWeaveIndices(rows, 1, 1), [1]);
});

test("splitWeaveIndexAfterVisible tombstone case", () => {
  const s0 = initialState(["a", "b"]);
  const s1 = updateState(s0, ["b"], "c1");
  const rows = deserializeState(s1);
  assert.equal(splitWeaveIndexAfterVisible(rows, 0), 0);
  assert.equal(splitWeaveIndexAfterVisible(rows, 1), rows.length);
});

test("visible range errors", () => {
  const rows = deserializeState(initialState(["only"]));
  assert.throws(() => visibleRangeToWeaveIndices(rows, 1, 2), WeaveIntrospectError);
});

test("inspectRowsJson", () => {
  const j = inspectRowsJson(deserializeState(initialState(["z"])));
  assert.ok(Array.isArray(j.rows));
  assert.equal(j.rows[0]!.visible_line, 1);
});
