import test from "node:test";
import assert from "node:assert/strict";
import { END_MARKER } from "../conflicts";
import { currentLines, initialState, mergeStates, updateState } from "../core";

function swapLeftRight(s: string): string {
  return s.replace(/left/g, "swap").replace(/right/g, "left").replace(/swap/g, "right");
}

function checkMerges(
  thing1: string,
  thing2: string,
  expectedResult: string[],
  expectedConflicts?: string[],
): void {
  const [state1, conflicts1] = mergeStates(thing1, thing2);
  const [state2, conflicts2] = mergeStates(thing2, thing1);
  assert.equal(state1, state2);
  if (expectedConflicts === undefined) {
    assert.deepEqual(conflicts1, conflicts2);
    assert.deepEqual(conflicts1, expectedResult);
  } else {
    assert.deepEqual(conflicts1, expectedConflicts);
    assert.deepEqual(conflicts2, expectedConflicts.map(swapLeftRight));
  }
  assert.deepEqual(currentLines(state1), expectedResult);
}

const SAL = "<<<<<<< begin added left";
const SDL = "<<<<<<< begin deleted left";
const SDR = "<<<<<<< begin deleted right";
const MAL = "======= begin added left";
const MAR = "======= begin added right";
const MAB = "======= begin added both";
const MDL = "======= begin deleted left";
const MDR = "======= begin deleted right";
const END = END_MARKER;

function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield [...arr];
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [arr[i]!, ...perm];
    }
  }
}

test("initial", () => {
  assert.equal(initialState([]), "");
  assert.deepEqual(currentLines(""), []);
  const v1 = initialState(["line 1", "line 4"]);
  const v2 = initialState(["line 2", "line 3"]);
  const [state1] = mergeStates(v1, v2);
  const [state2] = mergeStates(v2, v1);
  assert.equal(state1, state2);
  assert.deepEqual(currentLines(state1), ["line 1", "line 4", "line 2", "line 3"]);
});

test("bottom and top", () => {
  const initial = initialState(["A"]);
  const insertBelow = updateState(initial, ["B", "A"]);
  const replaceBelow = updateState(insertBelow, ["B"]);
  const insertAbove = updateState(initial, ["A", "B"]);
  const replaceAbove = updateState(insertAbove, ["B"]);
  const del = updateState(initial, []);
  checkMerges(initial, initial, ["A"]);
  checkMerges(initial, insertBelow, ["B", "A"]);
  checkMerges(initial, replaceBelow, ["B"]);
  checkMerges(initial, insertAbove, ["A", "B"]);
  checkMerges(initial, replaceAbove, ["B"]);
  checkMerges(initial, del, []);
  checkMerges(insertBelow, insertBelow, ["B", "A"]);
  checkMerges(insertBelow, replaceBelow, ["B"]);
  checkMerges(insertBelow, insertAbove, ["B", "A", "B"]);
  checkMerges(insertBelow, replaceAbove, ["B", "B"], [SAL, "B", MDR, "A", MAR, "B", END]);
  checkMerges(insertBelow, del, ["B"], [SAL, "B", MDR, "A", END]);
  checkMerges(replaceBelow, replaceBelow, ["B"]);
  checkMerges(replaceBelow, insertAbove, ["B", "B"], [SAL, "B", MDL, "A", MAR, "B", END]);
  checkMerges(replaceBelow, replaceAbove, ["B", "B"], [SAL, "B", MAR, "B", END]);
  checkMerges(replaceBelow, del, ["B"]);
  checkMerges(insertAbove, insertAbove, ["A", "B"]);
  checkMerges(insertAbove, replaceAbove, ["B"]);
  checkMerges(insertAbove, del, ["B"], [SDR, "A", MAL, "B", END]);
  checkMerges(replaceAbove, replaceAbove, ["B"]);
  checkMerges(replaceAbove, del, ["B"]);
  checkMerges(del, del, []);
});

test("bottom", () => {
  const initial = initialState(["A", "X"]);
  const insertBelow = updateState(initial, ["B", "A", "X"]);
  const replaceBelow = updateState(insertBelow, ["B", "X"]);
  const insertAbove = updateState(initial, ["A", "B", "X"]);
  const replaceAbove = updateState(insertAbove, ["B", "X"]);
  const del = updateState(initial, ["X"]);
  checkMerges(initial, initial, ["A", "X"]);
  checkMerges(initial, insertBelow, ["B", "A", "X"]);
  checkMerges(initial, replaceBelow, ["B", "X"]);
  checkMerges(initial, insertAbove, ["A", "B", "X"]);
  checkMerges(initial, replaceAbove, ["B", "X"]);
  checkMerges(initial, del, ["X"]);
  checkMerges(insertBelow, insertBelow, ["B", "A", "X"]);
  checkMerges(insertBelow, replaceBelow, ["B", "X"]);
  checkMerges(insertBelow, insertAbove, ["B", "A", "B", "X"]);
  checkMerges(insertBelow, replaceAbove, ["B", "B", "X"], [SAL, "B", MDR, "A", MAR, "B", END, "X"]);
  checkMerges(insertBelow, del, ["B", "X"], [SAL, "B", MDR, "A", END, "X"]);
  checkMerges(replaceBelow, replaceBelow, ["B", "X"]);
  checkMerges(replaceBelow, insertAbove, ["B", "B", "X"], [SAL, "B", MDL, "A", MAR, "B", END, "X"]);
  checkMerges(replaceBelow, replaceAbove, ["B", "B", "X"], [SAL, "B", MAR, "B", END, "X"]);
  checkMerges(replaceBelow, del, ["B", "X"]);
  checkMerges(insertAbove, insertAbove, ["A", "B", "X"]);
  checkMerges(insertAbove, replaceAbove, ["B", "X"]);
  checkMerges(insertAbove, del, ["B", "X"], [SDR, "A", MAL, "B", END, "X"]);
  checkMerges(replaceAbove, replaceAbove, ["B", "X"]);
  checkMerges(replaceAbove, del, ["B", "X"]);
  checkMerges(del, del, ["X"]);
});

test("top", () => {
  const initial = initialState(["X", "A"]);
  const insertBelow = updateState(initial, ["X", "B", "A"]);
  const replaceBelow = updateState(insertBelow, ["X", "B"]);
  const insertAbove = updateState(initial, ["X", "A", "B"]);
  const replaceAbove = updateState(insertAbove, ["X", "B"]);
  const del = updateState(initial, ["X"]);
  checkMerges(initial, initial, ["X", "A"]);
  checkMerges(initial, insertBelow, ["X", "B", "A"]);
  checkMerges(initial, replaceBelow, ["X", "B"]);
  checkMerges(initial, insertAbove, ["X", "A", "B"]);
  checkMerges(initial, replaceAbove, ["X", "B"]);
  checkMerges(initial, del, ["X"]);
  checkMerges(insertBelow, insertBelow, ["X", "B", "A"]);
  checkMerges(insertBelow, replaceBelow, ["X", "B"]);
  checkMerges(insertBelow, insertAbove, ["X", "B", "A", "B"]);
  checkMerges(insertBelow, replaceAbove, ["X", "B", "B"], ["X", SAL, "B", MDR, "A", MAR, "B", END]);
  checkMerges(insertBelow, del, ["X", "B"], ["X", SAL, "B", MDR, "A", END]);
  checkMerges(replaceBelow, replaceBelow, ["X", "B"]);
  checkMerges(replaceBelow, insertAbove, ["X", "B", "B"], ["X", SAL, "B", MDL, "A", MAR, "B", END]);
  checkMerges(replaceBelow, replaceAbove, ["X", "B", "B"], ["X", SAL, "B", MAR, "B", END]);
  checkMerges(replaceBelow, del, ["X", "B"]);
  checkMerges(insertAbove, insertAbove, ["X", "A", "B"]);
  checkMerges(insertAbove, replaceAbove, ["X", "B"]);
  checkMerges(insertAbove, del, ["X", "B"], ["X", SDR, "A", MAL, "B", END]);
  checkMerges(replaceAbove, replaceAbove, ["X", "B"]);
  checkMerges(replaceAbove, del, ["X", "B"]);
  checkMerges(del, del, ["X"]);
});

test("generation counting", () => {
  const count0 = initialState([]);
  const count1 = updateState(count0, ["A"]);
  const count2 = updateState(count1, []);
  const count3 = updateState(count2, ["A"]);
  const count4 = updateState(count3, []);
  checkMerges(count0, count1, ["A"]);
  checkMerges(count0, count2, []);
  checkMerges(count0, count3, ["A"]);
  checkMerges(count0, count4, []);
  checkMerges(count1, count1, ["A"]);
  checkMerges(count1, count2, []);
  checkMerges(count1, count3, ["A"]);
  checkMerges(count1, count4, []);
  checkMerges(count2, count2, []);
  checkMerges(count2, count3, ["A"]);
  checkMerges(count2, count4, []);
  checkMerges(count3, count3, ["A"]);
  checkMerges(count3, count4, []);
  checkMerges(count4, count4, []);
});

test("noop duplicate lines preserves hidden history", () => {
  let state = initialState(["A", "A"]);
  state = updateState(state, ["A"]);
  assert.equal(updateState(state, ["A"]), state);
});

function testInsertionsSingle(a: string, b: string, c: string, d: string): void {
  const [state1] = mergeStates(a, b);
  const [state2] = mergeStates(c, d);
  const [state3] = mergeStates(state1, state2);
  assert.deepEqual(currentLines(state3), ["A", "B", "C", "D"]);
}

test("insertions", () => {
  const mylist = ["A", "B", "C", "D"].map((x) => initialState([x]));
  for (const perm of permutations(mylist)) {
    testInsertionsSingle(perm[0]!, perm[1]!, perm[2]!, perm[3]!);
  }
});

function testInsertionsBelowSingle(a: string, b: string, c: string, d: string): void {
  const [state1] = mergeStates(a, b);
  const [state2] = mergeStates(c, d);
  const [state3] = mergeStates(state1, state2);
  assert.deepEqual(currentLines(state3), ["A", "B", "C", "D", "X"]);
}

test("insertions below", () => {
  const initial = initialState(["X"]);
  const mylist = ["A", "B", "C", "D"].map((x) => updateState(initial, [x, "X"]));
  for (const perm of permutations(mylist)) {
    testInsertionsBelowSingle(perm[0]!, perm[1]!, perm[2]!, perm[3]!);
  }
});

test("space separated insert insert", () => {
  const initial = initialState([""]);
  const insertLeft = updateState(initial, ["A", ""]);
  const insertRight = updateState(initial, ["", "B"]);
  checkMerges(insertLeft, insertRight, ["A", "", "B"], [SAL, "A", MAB, "", MAR, "B", END]);
});

test("space separated insert delete", () => {
  const initial = initialState(["", "B"]);
  const insertLeft = updateState(initial, ["A", "", "B"]);
  const deleteRight = updateState(initial, [""]);
  checkMerges(insertLeft, deleteRight, ["A", ""], [SAL, "A", MAB, "", MDR, "B", END]);
});

test("space separated delete insert", () => {
  const initial = initialState(["A", ""]);
  const deleteLeft = updateState(initial, [""]);
  const insertRight = updateState(initial, ["A", "", "B"]);
  checkMerges(deleteLeft, insertRight, ["", "B"], [SDL, "A", MAB, "", MAR, "B", END]);
});

test("space separated delete delete", () => {
  const initial = initialState(["A", "", "B"]);
  const deleteLeft = updateState(initial, ["", "B"]);
  const deleteRight = updateState(initial, ["A", ""]);
  checkMerges(deleteLeft, deleteRight, [""]);
});

test("deleted both", () => {
  const initial = initialState(["", "X", ""]);
  const left = updateState(initial, ["A", "", ""]);
  const right = updateState(initial, ["", "", "B"]);
  checkMerges(left, right, ["A", "", "", "B"], [SAL, "A", MAB, "", "", MAR, "B", END]);
});

test("deleted both2", () => {
  const initial = initialState(["A"]);
  let left = updateState(initial, ["X", "A"]);
  left = updateState(left, ["X"]);
  updateState(initial, ["A", "Y"]);
  const right = updateState(initial, ["Y"]);
  checkMerges(left, right, ["X", "Y"], [SAL, "X", MAR, "Y", END]);
});

test("update insert multiple", () => {
  const initial = initialState(["A", "B"]);
  const updated = updateState(initial, ["A", "X", "Y", "B"]);
  assert.deepEqual(currentLines(updated), ["A", "X", "Y", "B"]);
});

test("insert low tree", () => {
  const initial = initialState(["A"]);
  let updated = updateState(initial, ["Y", "A"]);
  updated = updateState(updated, ["X", "Y", "A"]);
  const right = updateState(initial, ["A", "B"]);
  checkMerges(updated, right, ["X", "Y", "A", "B"]);
});

function checkAssociative(a: string, b: string, c: string): void {
  const [ab] = mergeStates(a, b);
  const [ab_c] = mergeStates(ab, c);
  const [bc] = mergeStates(b, c);
  const [a_bc] = mergeStates(a, bc);
  assert.equal(ab_c, a_bc);
  assert.deepEqual(currentLines(ab_c), currentLines(a_bc));
}

test("associativity generation counts", () => {
  const start = initialState(["X"]);
  const a = start;
  const b = updateState(start, []);
  const c = updateState(updateState(start, []), ["X"]);
  const [ac] = mergeStates(a, c);
  const [acb] = mergeStates(ac, b);
  const [cb] = mergeStates(c, b);
  const [a_cb] = mergeStates(a, cb);
  assert.deepEqual(currentLines(acb), currentLines(a_cb));
});

test("associativity", () => {
  let s = initialState(["A", "B"]);
  let a = updateState(s, ["A", "X", "B"]);
  let b = updateState(s, ["A", "Y", "B"]);
  let c = updateState(s, ["A", "B", "Z"]);
  checkAssociative(a, b, c);
  a = updateState(s, ["B"]);
  b = updateState(s, ["A"]);
  c = updateState(s, ["A", "B", "C"]);
  checkAssociative(a, b, c);
  a = updateState(updateState(s, []), ["A", "B"]);
  b = updateState(s, []);
  c = updateState(s, []);
  checkAssociative(a, b, c);
  a = initialState(["P"]);
  b = initialState(["Q"]);
  c = initialState(["R"]);
  checkAssociative(a, b, c);
  s = initialState(["M"]);
  const left = updateState(s, ["M", "L"]);
  const right = updateState(s, ["R", "M"]);
  const [merged] = mergeStates(left, right);
  checkAssociative(left, right, merged);
  checkAssociative(merged, left, updateState(s, []));
});

function checkIdempotent(state: string): void {
  const [merged] = mergeStates(state, state);
  assert.equal(merged, state);
}

test("idempotency", () => {
  checkIdempotent(initialState([]));
  checkIdempotent(initialState(["A", "B", "C"]));
  let state = initialState(["A", "B"]);
  checkIdempotent(state);
  state = updateState(state, ["A", "X", "B"]);
  checkIdempotent(state);
  state = updateState(state, ["A", "B"]);
  checkIdempotent(state);
  state = updateState(state, ["A", "X", "B"]);
  checkIdempotent(state);
  const left = updateState(initialState(["M"]), ["M", "L"]);
  const right = updateState(initialState(["M"]), ["R", "M"]);
  const [merged] = mergeStates(left, right);
  checkIdempotent(merged);
});
