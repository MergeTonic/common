import test from "node:test";
import assert from "node:assert/strict";
import { deserializeState } from "../state";
import { currentLines, initialState, mergeStates } from "../core";
import { splitWeaveIndexAfterVisible } from "../weaveIntrospect";
import { extractWeaveRows, spliceWeaveRows, WeaveExtractError } from "../weaveSlice";

test("extract full state", () => {
  const raw = initialState(["a", "b", "c"]);
  const rows = deserializeState(raw);
  assert.equal(extractWeaveRows(raw, 0, rows.length), raw);
});

test("extract invalid range", () => {
  const raw = initialState(["a"]);
  assert.throws(() => extractWeaveRows(raw, 0, 5), WeaveExtractError);
});

test("splice append and prepend", () => {
  const t = initialState(["a"]);
  const f = initialState(["b"]);
  const n = deserializeState(t).length;
  assert.deepEqual(currentLines(spliceWeaveRows(t, f, n)), ["a", "b"]);
  assert.deepEqual(currentLines(spliceWeaveRows(t, f, 0)), ["b", "a"]);
});

test("splice after visible line index", () => {
  const t = initialState(["a", "b"]);
  const f = initialState(["z"]);
  const rows = deserializeState(t);
  const split = splitWeaveIndexAfterVisible(rows, 1);
  assert.deepEqual(currentLines(spliceWeaveRows(t, f, split)), ["a", "z", "b"]);
});

test("mergeStates smoke after splice", () => {
  const left = initialState(["x"]);
  const right = initialState(["y"]);
  const [merged] = mergeStates(left, right);
  assert.ok(currentLines(merged).includes("x"));
  assert.ok(currentLines(merged).includes("y"));
});
