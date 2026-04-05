"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../packages/tonic-core/dist/conflicts.js
var require_conflicts = __commonJS({
  "../../packages/tonic-core/dist/conflicts.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.END_MARKER = exports2.conflictStrings = exports2.PEACE = exports2.CONFLICT_DELETED_RIGHT = exports2.CONFLICT_DELETED_LEFT = exports2.CONFLICT_ADDED_BOTH = exports2.CONFLICT_ADDED_RIGHT = exports2.CONFLICT_ADDED_LEFT = void 0;
    exports2.showConflicts = showConflicts;
    exports2.conflictCode = conflictCode;
    exports2.CONFLICT_ADDED_LEFT = 0;
    exports2.CONFLICT_ADDED_RIGHT = 1;
    exports2.CONFLICT_ADDED_BOTH = 2;
    exports2.CONFLICT_DELETED_LEFT = 3;
    exports2.CONFLICT_DELETED_RIGHT = 4;
    exports2.PEACE = 5;
    exports2.conflictStrings = [
      "added left",
      "added right",
      "added both",
      "deleted left",
      "deleted right",
      "deleted both"
    ];
    exports2.END_MARKER = ">>>>>>> end conflict";
    function showConflicts(resultLines) {
      const finalResult = [];
      let lastState = exports2.PEACE;
      for (const [line, newState] of resultLines) {
        if (newState === exports2.PEACE) {
          if (lastState !== exports2.PEACE) {
            finalResult.push(exports2.END_MARKER);
          }
        } else if (lastState === exports2.PEACE) {
          finalResult.push("<<<<<<< begin " + exports2.conflictStrings[newState]);
        } else if (lastState !== newState) {
          finalResult.push("======= begin " + exports2.conflictStrings[newState]);
        }
        finalResult.push(line);
        lastState = newState;
      }
      if (lastState !== exports2.PEACE) {
        finalResult.push(exports2.END_MARKER);
      }
      return finalResult;
    }
    function conflictCode(in_child, on_left, on_right) {
      if (!on_left && !on_right) {
        throw new Error("conflictCode requires on_left or on_right");
      }
      if (in_child) {
        if (on_left && on_right) {
          return exports2.CONFLICT_ADDED_BOTH;
        }
        if (on_left) {
          return exports2.CONFLICT_ADDED_LEFT;
        }
        return exports2.CONFLICT_ADDED_RIGHT;
      }
      if (on_right) {
        return exports2.CONFLICT_DELETED_LEFT;
      }
      return exports2.CONFLICT_DELETED_RIGHT;
    }
  }
});

// ../../packages/tonic-core/dist/sequenceMatcher.js
var require_sequenceMatcher = __commonJS({
  "../../packages/tonic-core/dist/sequenceMatcher.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SequenceMatcher = void 0;
    var SequenceMatcher = class {
      isjunk;
      autojunk;
      a = [];
      b = [];
      b2j = /* @__PURE__ */ new Map();
      bjunk = /* @__PURE__ */ new Set();
      bpopular = /* @__PURE__ */ new Set();
      fullbcount = null;
      matchingBlocks = null;
      opcodes = null;
      constructor(isjunk, a, b, autojunk = true) {
        this.isjunk = isjunk;
        this.autojunk = autojunk;
        this.setSeqs(a, b);
      }
      setSeqs(a, b) {
        this.setSeq1(a);
        this.setSeq2(b);
      }
      setSeq1(a) {
        if (a === this.a) {
          return;
        }
        this.a = a;
        this.matchingBlocks = this.opcodes = null;
      }
      setSeq2(b) {
        if (b === this.b) {
          return;
        }
        this.b = b;
        this.matchingBlocks = this.opcodes = null;
        this.fullbcount = null;
        this.chainB();
      }
      chainB() {
        const b = this.b;
        const b2j = /* @__PURE__ */ new Map();
        for (let i = 0; i < b.length; i++) {
          const elt = b[i];
          let indices = b2j.get(elt);
          if (!indices) {
            indices = [];
            b2j.set(elt, indices);
          }
          indices.push(i);
        }
        const junk = /* @__PURE__ */ new Set();
        const isjunk = this.isjunk;
        if (isjunk) {
          for (const elt of b2j.keys()) {
            if (isjunk(elt)) {
              junk.add(elt);
            }
          }
          for (const elt of junk) {
            b2j.delete(elt);
          }
        }
        const popular = /* @__PURE__ */ new Set();
        const n = b.length;
        if (this.autojunk && n >= 200) {
          const ntest = Math.floor(n / 100) + 1;
          for (const [elt, idxs] of b2j) {
            if (idxs.length > ntest) {
              popular.add(elt);
            }
          }
          for (const elt of popular) {
            b2j.delete(elt);
          }
        }
        this.b2j = b2j;
        this.bjunk = junk;
        this.bpopular = popular;
      }
      findLongestMatch(alo, ahi, blo, bhi) {
        const a = this.a;
        const b = this.b;
        const b2j = this.b2j;
        const isbjunk = (x) => this.bjunk.has(x);
        if (ahi === void 0) {
          ahi = a.length;
        }
        if (blo === void 0) {
          blo = 0;
        }
        if (bhi === void 0) {
          bhi = b.length;
        }
        let besti = alo;
        let bestj = blo;
        let bestsize = 0;
        let j2len = /* @__PURE__ */ new Map();
        const nothing = [];
        for (let i = alo; i < ahi; i++) {
          const j2lenget = (j) => j2len.get(j) ?? 0;
          const newj2len = /* @__PURE__ */ new Map();
          for (const j of b2j.get(a[i]) ?? nothing) {
            if (j < blo) {
              continue;
            }
            if (j >= bhi) {
              break;
            }
            const k = j2lenget(j - 1) + 1;
            newj2len.set(j, k);
            if (k > bestsize) {
              besti = i - k + 1;
              bestj = j - k + 1;
              bestsize = k;
            }
          }
          j2len = newj2len;
        }
        while (besti > alo && bestj > blo && !isbjunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
          besti -= 1;
          bestj -= 1;
          bestsize += 1;
        }
        while (besti + bestsize < ahi && bestj + bestsize < bhi && !isbjunk(b[bestj + bestsize]) && a[besti + bestsize] === b[bestj + bestsize]) {
          bestsize += 1;
        }
        while (besti > alo && bestj > blo && isbjunk(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
          besti -= 1;
          bestj -= 1;
          bestsize += 1;
        }
        while (besti + bestsize < ahi && bestj + bestsize < bhi && isbjunk(b[bestj + bestsize]) && a[besti + bestsize] === b[bestj + bestsize]) {
          bestsize += 1;
        }
        return { a: besti, b: bestj, size: bestsize };
      }
      getMatchingBlocks() {
        if (this.matchingBlocks !== null) {
          return this.matchingBlocks;
        }
        const la = this.a.length;
        const lb = this.b.length;
        const queue = [[0, la, 0, lb]];
        const matchingBlocks = [];
        while (queue.length > 0) {
          const item = queue.pop();
          const [alo, ahi, blo, bhi] = item;
          const { a: i, b: j, size: k } = this.findLongestMatch(alo, ahi, blo, bhi);
          if (k) {
            matchingBlocks.push({ a: i, b: j, size: k });
            if (alo < i && blo < j) {
              queue.push([alo, i, blo, j]);
            }
            if (i + k < ahi && j + k < bhi) {
              queue.push([i + k, ahi, j + k, bhi]);
            }
          }
        }
        matchingBlocks.sort((x, y) => x.a !== y.a ? x.a - y.a : x.b - y.b);
        let i1 = 0;
        let j1 = 0;
        let k1 = 0;
        const nonAdjacent = [];
        for (const { a: i2, b: j2, size: k2 } of matchingBlocks) {
          if (i1 + k1 === i2 && j1 + k1 === j2) {
            k1 += k2;
          } else {
            if (k1) {
              nonAdjacent.push({ a: i1, b: j1, size: k1 });
            }
            i1 = i2;
            j1 = j2;
            k1 = k2;
          }
        }
        if (k1) {
          nonAdjacent.push({ a: i1, b: j1, size: k1 });
        }
        nonAdjacent.push({ a: la, b: lb, size: 0 });
        this.matchingBlocks = nonAdjacent;
        return this.matchingBlocks;
      }
      getOpcodes() {
        if (this.opcodes !== null) {
          return this.opcodes;
        }
        let i = 0;
        let j = 0;
        const answer = [];
        for (const { a: ai, b: bj, size } of this.getMatchingBlocks()) {
          let tag = "";
          if (i < ai && j < bj) {
            tag = "replace";
          } else if (i < ai) {
            tag = "delete";
          } else if (j < bj) {
            tag = "insert";
          }
          if (tag) {
            answer.push([tag, i, ai, j, bj]);
          }
          i = ai + size;
          j = bj + size;
          if (size) {
            answer.push(["equal", ai, i, bj, j]);
          }
        }
        this.opcodes = answer;
        return this.opcodes;
      }
    };
    exports2.SequenceMatcher = SequenceMatcher;
  }
});

// ../../packages/tonic-core/dist/diff.js
var require_diff = __commonJS({
  "../../packages/tonic-core/dist/diff.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.getDeletionsAndInsertions = getDeletionsAndInsertions;
    var sequenceMatcher_1 = require_sequenceMatcher();
    function getDeletionsAndInsertions(lines1, lines2) {
      const deletions = [];
      const insertions = [];
      const sm = new sequenceMatcher_1.SequenceMatcher(null, lines1, lines2);
      for (const row of sm.getOpcodes()) {
        const [tag, l1_begin, l1_end, l2_begin, l2_end] = row;
        if (tag === "delete" || tag === "replace") {
          for (let i = l1_begin; i < l1_end; i++) {
            deletions.push(i);
          }
        }
        if (tag === "insert" || tag === "replace") {
          insertions.push([l1_begin, lines2.slice(l2_begin, l2_end)]);
        }
      }
      return [deletions, insertions];
    }
  }
});

// ../../packages/tonic-core/dist/state.js
var require_state = __commonJS({
  "../../packages/tonic-core/dist/state.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.serializeState = serializeState;
    exports2.deserializeState = deserializeState;
    function serializeState(state) {
      const parts = [];
      for (const [line, depth, anchored_right, count, provenance] of state) {
        parts.push(`${depth} ${anchored_right ? ">" : "<"} ${count} [${provenance.join(",")}] ${line}`);
      }
      return parts.join("\n");
    }
    function deserializeState(mystr) {
      if (mystr === "") {
        return [];
      }
      const result = [];
      for (const line of mystr.split("\n")) {
        const vals = line.split(" ");
        const hasProv = vals[3]?.startsWith("[") && vals[3]?.endsWith("]");
        const provenance = hasProv ? vals[3].slice(1, -1).split(",").filter((x) => x.length > 0) : [];
        result.push([
          vals.slice(hasProv ? 4 : 3).join(" "),
          parseInt(vals[0], 10),
          vals[1] === ">",
          parseInt(vals[2], 10),
          provenance
        ]);
      }
      return result;
    }
  }
});

// ../../packages/tonic-core/dist/tree.js
var require_tree = __commonJS({
  "../../packages/tonic-core/dist/tree.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.stateToTree = stateToTree;
    exports2.mergeTrees = mergeTrees;
    function stateToTree(state) {
      const rootChildrenAbove = [];
      const childrenAbove = state.map(() => []);
      const lastByDepth = state.map(() => null);
      for (let i = 0; i < state.length; i++) {
        const [line, depth, anchored_right] = state[i];
        if (!anchored_right) {
          if (depth === 0) {
            rootChildrenAbove.push(i);
          } else {
            const parent = lastByDepth[depth - 1];
            childrenAbove[parent].push(i);
          }
        }
        lastByDepth[depth] = i;
      }
      const childrenBelow = state.map(() => []);
      lastByDepth.fill(null);
      for (let i = state.length - 1; i >= 0; i--) {
        const [, depth, anchored_right] = state[i];
        if (anchored_right) {
          const parent = lastByDepth[depth - 1];
          childrenBelow[parent].push(i);
        }
        lastByDepth[depth] = i;
      }
      for (const cb of childrenBelow) {
        cb.reverse();
      }
      return [
        null,
        -1,
        [],
        [],
        rootChildrenAbove.map((i) => pullOutTree(i, state, childrenAbove, childrenBelow)),
        -1
      ];
    }
    function pullOutTree(pos, state, childrenAbove, childrenBelow) {
      const [line, , , count, provenance] = state[pos];
      const depth = state[pos][1];
      return [
        line,
        count,
        provenance,
        childrenBelow[pos].map((x) => pullOutTree(x, state, childrenAbove, childrenBelow)),
        childrenAbove[pos].map((x) => pullOutTree(x, state, childrenAbove, childrenBelow)),
        depth
      ];
    }
    function mergeTrees(output, tree1, tree2, anchored_right) {
      const [line1, count1, provenance1, lowtrees1, hightrees1, depth1] = tree1;
      const [line2, count2, provenance2, lowtrees2, hightrees2, depth2] = tree2;
      if (line1 !== line2) {
        throw new Error("mergeTrees line mismatch");
      }
      if (depth1 !== depth2) {
        throw new Error("mergeTrees depth mismatch");
      }
      mergeTreeLists(output, lowtrees1, lowtrees2, true);
      if (line1 !== null) {
        let provenance = provenance1;
        if (count2 > count1) {
          provenance = provenance2;
        } else if (count1 === count2) {
          provenance = provenance1.join("|") <= provenance2.join("|") ? provenance1 : provenance2;
        }
        output.push([
          line1,
          depth1,
          anchored_right,
          Math.max(count1, count2),
          provenance,
          Boolean(count1 % 2),
          Boolean(count2 % 2)
        ]);
      }
      mergeTreeLists(output, hightrees1, hightrees2, false);
    }
    function mergeTreeLists(output, leftTrees, rightTrees, anchored_right) {
      let pos1 = 0;
      let pos2 = 0;
      while (pos1 < leftTrees.length || pos2 < rightTrees.length) {
        if (pos2 === rightTrees.length) {
          insertTree(output, leftTrees[pos1], false, anchored_right);
          pos1 += 1;
        } else if (pos1 === leftTrees.length) {
          insertTree(output, rightTrees[pos2], true, anchored_right);
          pos2 += 1;
        } else {
          const l = leftTrees[pos1];
          const r = rightTrees[pos2];
          const l0 = l[0];
          const r0 = r[0];
          if (l0 === r0) {
            mergeTrees(output, l, r, anchored_right);
            pos1 += 1;
            pos2 += 1;
          } else if (l0 < r0) {
            insertTree(output, l, false, anchored_right);
            pos1 += 1;
          } else {
            insertTree(output, r, true, anchored_right);
            pos2 += 1;
          }
        }
      }
    }
    function insertTree(output, tree, fromRight, anchored_right) {
      const [line, count, provenance, lowtrees, hightrees, depth] = tree;
      for (const newTree of lowtrees) {
        insertTree(output, newTree, fromRight, true);
      }
      output.push([line, depth, anchored_right, count, provenance, !fromRight, fromRight]);
      for (const newTree of hightrees) {
        insertTree(output, newTree, fromRight, false);
      }
    }
  }
});

// ../../packages/tonic-core/dist/core.js
var require_core = __commonJS({
  "../../packages/tonic-core/dist/core.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.initialState = initialState;
    exports2.currentLines = currentLines;
    exports2.updateState = updateState;
    exports2.mergeStates = mergeStates;
    var conflicts_1 = require_conflicts();
    var diff_1 = require_diff();
    var state_1 = require_state();
    var tree_1 = require_tree();
    function initialState(lines, commitId) {
      return (0, state_1.serializeState)(lines.map((line, i) => [line, i, false, 1, commitId ? [commitId] : []]));
    }
    function currentLines(rawState) {
      const state = (0, state_1.deserializeState)(rawState);
      return state.filter(([, , , count]) => count % 2).map(([line]) => line);
    }
    function updateState(rawState, lines, commitId) {
      let state = (0, state_1.deserializeState)(rawState);
      if (state.length === 0) {
        return initialState(lines);
      }
      const currentVisibleLines = state.filter(([, , , count]) => count % 2).map(([line]) => line);
      if (currentVisibleLines.length === lines.length && currentVisibleLines.every((v, i) => v === lines[i])) {
        return rawState;
      }
      const [deletions, insertions] = (0, diff_1.getDeletionsAndInsertions)(state.map(([line]) => line), lines);
      for (const deletion of deletions) {
        if (state[deletion][3] % 2) {
          state[deletion][3] += 1;
          if (commitId) {
            state[deletion][4].push(commitId);
          }
        }
      }
      const deletedSet = new Set(deletions);
      for (let i = 0; i < state.length; i++) {
        if (!deletedSet.has(i) && state[i][3] % 2 === 0) {
          state[i][3] += 1;
          if (commitId) {
            state[i][4].push(commitId);
          }
        }
      }
      const result = [];
      let posInInsertions = 0;
      for (let pos = 0; pos <= state.length; pos++) {
        while (posInInsertions < insertions.length && insertions[posInInsertions][0] === pos) {
          let up;
          if (pos === state.length) {
            up = true;
          } else if (pos === 0) {
            up = false;
          } else {
            up = state[pos - 1][1] > state[pos][1];
          }
          const newlines = insertions[posInInsertions][1];
          if (up) {
            result.push([newlines[0], state[pos - 1][1] + 1, false, 1, commitId ? [commitId] : []]);
          } else {
            result.push([newlines[0], state[pos][1] + 1, true, 1, commitId ? [commitId] : []]);
          }
          for (let k = 1; k < newlines.length; k++) {
            result.push([newlines[k], result[result.length - 1][1] + 1, false, 1, commitId ? [commitId] : []]);
          }
          posInInsertions += 1;
        }
        if (pos < state.length) {
          result.push(state[pos]);
        }
      }
      return (0, state_1.serializeState)(result);
    }
    function mergeStates(state1, state2) {
      const tree1 = (0, tree_1.stateToTree)((0, state_1.deserializeState)(state1));
      const tree2 = (0, tree_1.stateToTree)((0, state_1.deserializeState)(state2));
      const statusLines = [];
      (0, tree_1.mergeTrees)(statusLines, tree1, tree2, false);
      const resultLines = [];
      let begin = 0;
      for (let i = 0; i <= statusLines.length; i++) {
        if (i === statusLines.length || statusLines[i][5] && statusLines[i][6] && statusLines[i][0].trim() !== "") {
          let foundAdd = false;
          let hitLeft = false;
          let hitRight = false;
          for (let j = begin; j < i; j++) {
            const [, , , inChild, , onLeft, onRight] = statusLines[j];
            if (onLeft !== onRight) {
              if (inChild % 2 === Number(onLeft)) {
                hitLeft = true;
              } else {
                hitRight = true;
              }
            }
            if (inChild % 2 && onLeft !== onRight) {
              foundAdd = true;
            }
          }
          if (hitLeft && hitRight && foundAdd) {
            for (let j = begin; j < i; j++) {
              const [line, , , inChild, , onLeft, onRight] = statusLines[j];
              if (onLeft || onRight) {
                resultLines.push([line, (0, conflicts_1.conflictCode)(Boolean(inChild % 2), onLeft, onRight)]);
              }
            }
          } else {
            for (let j = begin; j < i; j++) {
              const [line, , , inChild, , , ,] = statusLines[j];
              if (inChild % 2) {
                resultLines.push([line, conflicts_1.PEACE]);
              }
            }
          }
          if (i < statusLines.length) {
            resultLines.push([statusLines[i][0], conflicts_1.PEACE]);
          }
          begin = i + 1;
        }
      }
      const serialized = (0, state_1.serializeState)(statusLines.map((x) => x.slice(0, 5)));
      return [serialized, (0, conflicts_1.showConflicts)(resultLines)];
    }
  }
});

// ../../packages/tonic-core/dist/weaveIntrospect.js
var require_weaveIntrospect = __commonJS({
  "../../packages/tonic-core/dist/weaveIntrospect.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WeaveIntrospectError = void 0;
    exports2.buildVisibleWeaveMaps = buildVisibleWeaveMaps;
    exports2.visibleLineCount = visibleLineCount;
    exports2.visibleRangeToWeaveIndices = visibleRangeToWeaveIndices;
    exports2.splitWeaveIndexAfterVisible = splitWeaveIndexAfterVisible;
    exports2.inspectRowsJson = inspectRowsJson;
    function buildVisibleWeaveMaps(rows) {
      const views = [];
      const visibleToWeave = [];
      const weaveToVisible = /* @__PURE__ */ new Map();
      let visibleCounter = 0;
      for (let i = 0; i < rows.length; i++) {
        const [line, depth, anchoredRight, count, provenance] = rows[i];
        let vl = null;
        if (count % 2) {
          visibleCounter += 1;
          vl = visibleCounter;
          visibleToWeave.push(i);
          weaveToVisible.set(i, vl);
        }
        views.push({
          weave_index: i,
          line,
          depth,
          anchored_right: anchoredRight,
          count,
          provenance: [...provenance],
          visible: Boolean(count % 2),
          visible_line: vl
        });
      }
      return { views, visibleToWeave, weaveToVisible };
    }
    function visibleLineCount(rows) {
      return rows.filter((r) => r[3] % 2).length;
    }
    var WeaveIntrospectError = class extends Error {
      name = "WeaveIntrospectError";
    };
    exports2.WeaveIntrospectError = WeaveIntrospectError;
    function visibleRangeToWeaveIndices(rows, startVisible, endVisible) {
      const nVis = visibleLineCount(rows);
      if (startVisible < 1 || endVisible < startVisible || endVisible > nVis) {
        throw new WeaveIntrospectError(`visible range [${startVisible}, ${endVisible}] invalid for ${nVis} visible lines`);
      }
      const { visibleToWeave } = buildVisibleWeaveMaps(rows);
      return visibleToWeave.slice(startVisible - 1, endVisible);
    }
    function splitWeaveIndexAfterVisible(rows, afterVisible) {
      const nVis = visibleLineCount(rows);
      if (afterVisible < 0 || afterVisible > nVis) {
        throw new WeaveIntrospectError(`after_visible ${afterVisible} out of range for ${nVis} visible lines`);
      }
      if (afterVisible === 0) {
        return 0;
      }
      if (afterVisible === nVis) {
        return rows.length;
      }
      let visibleCounter = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row[3] % 2) {
          visibleCounter += 1;
          if (visibleCounter === afterVisible) {
            return i + 1;
          }
        }
      }
      throw new WeaveIntrospectError("internal: could not resolve after_visible");
    }
    function inspectRowsJson(rows) {
      const { views, visibleToWeave, weaveToVisible } = buildVisibleWeaveMaps(rows);
      const weaveToVisibleObj = {};
      for (const [k, v] of [...weaveToVisible.entries()].sort((a, b) => a[0] - b[0])) {
        weaveToVisibleObj[String(k)] = v;
      }
      return {
        rows: views,
        visible_to_weave: visibleToWeave,
        weave_to_visible: weaveToVisibleObj
      };
    }
  }
});

// ../../packages/tonic-core/dist/weaveSlice.js
var require_weaveSlice = __commonJS({
  "../../packages/tonic-core/dist/weaveSlice.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WeaveSpliceError = exports2.WeaveExtractError = void 0;
    exports2.extractWeaveRows = extractWeaveRows;
    exports2.spliceWeaveRows = spliceWeaveRows;
    var state_1 = require_state();
    var tree_1 = require_tree();
    var WeaveExtractError = class extends Error {
      name = "WeaveExtractError";
    };
    exports2.WeaveExtractError = WeaveExtractError;
    var WeaveSpliceError = class extends Error {
      name = "WeaveSpliceError";
    };
    exports2.WeaveSpliceError = WeaveSpliceError;
    function validateWeaveRows(rows) {
      try {
        (0, tree_1.stateToTree)(rows);
      } catch (e) {
        throw new WeaveExtractError("weave rows are not a structurally valid fragment (parent/depth chain broken)", { cause: e });
      }
    }
    function extractWeaveRows(rawState, weaveStart, weaveEnd, options = {}) {
      const rows = (0, state_1.deserializeState)(rawState);
      const { allowEmpty = false } = options;
      if (weaveStart < 0 || weaveEnd > rows.length || weaveStart > weaveEnd) {
        throw new WeaveExtractError(`invalid range [${weaveStart}, ${weaveEnd}) for ${rows.length} weave rows`);
      }
      if (weaveStart === weaveEnd) {
        if (allowEmpty) {
          return "";
        }
        throw new WeaveExtractError("empty extract range (use allowEmpty: true if intentional)");
      }
      const sub = rows.slice(weaveStart, weaveEnd);
      const minD = Math.min(...sub.map((r) => r[1]));
      const shifted = sub.map(([line, d, ar, c, p]) => [
        line,
        d - minD,
        ar,
        c,
        [...p]
      ]);
      validateWeaveRows(shifted);
      return (0, state_1.serializeState)(shifted);
    }
    function spliceWeaveRows(targetRaw, fragmentRaw, splitWeaveIndex) {
      const target = (0, state_1.deserializeState)(targetRaw);
      const fragment = (0, state_1.deserializeState)(fragmentRaw);
      if (splitWeaveIndex < 0 || splitWeaveIndex > target.length) {
        throw new WeaveSpliceError(`splitWeaveIndex ${splitWeaveIndex} out of range for ${target.length} target rows`);
      }
      if (fragment.length === 0) {
        return targetRaw;
      }
      const fragMin = Math.min(...fragment.map((r) => r[1]));
      const depthOff = splitWeaveIndex === 0 ? -fragMin : target[splitWeaveIndex - 1][1] - fragMin;
      const adjusted = fragment.map(([line, d, ar, c, p]) => [
        line,
        d + depthOff,
        ar,
        c,
        [...p]
      ]);
      const merged = [...target.slice(0, splitWeaveIndex), ...adjusted, ...target.slice(splitWeaveIndex)];
      try {
        validateWeaveRows(merged);
      } catch (e) {
        if (e instanceof WeaveExtractError) {
          throw new WeaveSpliceError(e.message, { cause: e });
        }
        throw e;
      }
      return (0, state_1.serializeState)(merged);
    }
  }
});

// ../../packages/tonic-core/dist/markerLabel.js
var require_markerLabel = __commonJS({
  "../../packages/tonic-core/dist/markerLabel.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseConflictLabel = parseConflictLabel5;
    exports2.formatConflictLabel = formatConflictLabel2;
    exports2.addTagToConflictLabel = addTagToConflictLabel;
    exports2.updateTagInConflictLabel = updateTagInConflictLabel;
    exports2.removeTagFromConflictLabel = removeTagFromConflictLabel;
    exports2.normalizeConflictLabel = normalizeConflictLabel;
    exports2.sanitizeAuthorTagToken = sanitizeAuthorTagToken;
    function cleanToken(token) {
      return token.trim();
    }
    function parseConflictLabel5(rawLabel) {
      const raw = rawLabel.trim();
      if (!raw) {
        return { raw: "", baseKind: "", tags: {} };
      }
      const parts = raw.split("|").map(cleanToken).filter(Boolean);
      if (parts.length === 0) {
        return { raw, baseKind: raw, tags: {} };
      }
      const baseKind = parts[0] ?? raw;
      const tags = {};
      for (const part of parts.slice(1)) {
        const idx = part.indexOf("=");
        if (idx <= 0) {
          continue;
        }
        const key = part.slice(0, idx).trim();
        const value = part.slice(idx + 1).trim();
        if (!key) {
          continue;
        }
        tags[key] = value;
      }
      return { raw, baseKind, tags };
    }
    function formatConflictLabel2(baseKind, tags = {}) {
      const kind = baseKind.trim();
      const entries = Object.entries(tags).filter(([key]) => key.trim().length > 0).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key.trim()}=${String(value).trim()}`);
      if (entries.length === 0) {
        return kind;
      }
      return [kind, ...entries].join(" | ");
    }
    function addTagToConflictLabel(label, key, value) {
      const parsed = parseConflictLabel5(label);
      parsed.tags[key] = value;
      return formatConflictLabel2(parsed.baseKind, parsed.tags);
    }
    function updateTagInConflictLabel(label, key, value) {
      return addTagToConflictLabel(label, key, value);
    }
    function removeTagFromConflictLabel(label, key) {
      const parsed = parseConflictLabel5(label);
      delete parsed.tags[key];
      return formatConflictLabel2(parsed.baseKind, parsed.tags);
    }
    function normalizeConflictLabel(label) {
      const parsed = parseConflictLabel5(label);
      return formatConflictLabel2(parsed.baseKind, parsed.tags);
    }
    function sanitizeAuthorTagToken(raw) {
      let s = raw.trim().replace(/\s+/g, "_");
      s = s.replace(/[|<>]/g, "");
      if (s.length > 120) {
        s = s.slice(0, 120);
      }
      return s || "unknown";
    }
  }
});

// ../../packages/tonic-core/dist/conflictParser.js
var require_conflictParser = __commonJS({
  "../../packages/tonic-core/dist/conflictParser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseTonicConflicts = parseTonicConflicts7;
    exports2.parseTonicConflictsWithDiagnostics = parseTonicConflictsWithDiagnostics2;
    exports2.conflictSummary = conflictSummary2;
    var markerLabel_1 = require_markerLabel();
    var BEGIN = /^<<<<<<< begin (.+)$/;
    var MID = /^======= begin (.+)$/;
    var END = /^>>>>>>> end conflict$/;
    function parseTonicConflicts7(text) {
      return parseTonicConflictsWithDiagnostics2(text).blocks;
    }
    function parseTonicConflictsWithDiagnostics2(text) {
      const lines = text.split(/\r?\n/);
      const blocks = [];
      const warnings = [];
      let i = 0;
      while (i < lines.length) {
        const bm = BEGIN.exec(lines[i]);
        if (!bm) {
          i += 1;
          continue;
        }
        const startLine = i;
        const kind = bm[1].trim();
        const parsedKind = (0, markerLabel_1.parseConflictLabel)(kind);
        i += 1;
        const segments = [];
        let currentLabel = kind;
        let current = [];
        let closed = false;
        while (i < lines.length) {
          const line = lines[i];
          if (END.test(line)) {
            segments.push({
              label: currentLabel,
              lines: current,
              metadata: (0, markerLabel_1.parseConflictLabel)(currentLabel)
            });
            blocks.push({
              startLine,
              endLine: i,
              kind,
              baseKind: parsedKind.baseKind,
              tags: { ...parsedKind.tags },
              segments
            });
            i += 1;
            closed = true;
            break;
          }
          const mm = MID.exec(line);
          if (mm) {
            segments.push({
              label: currentLabel,
              lines: current,
              metadata: (0, markerLabel_1.parseConflictLabel)(currentLabel)
            });
            currentLabel = mm[1].trim();
            current = [];
            i += 1;
            continue;
          }
          current.push(line);
          i += 1;
        }
        if (!closed) {
          warnings.push(`Unterminated Tonic conflict block (kind "${kind}") starting at line ${startLine + 1}`);
        }
      }
      return { blocks, warnings };
    }
    function conflictSummary2(block) {
      return `${block.kind} @ ${block.startLine + 1}-${block.endLine + 1}`;
    }
  }
});

// ../../packages/tonic-core/dist/gitConflictParser.js
var require_gitConflictParser = __commonJS({
  "../../packages/tonic-core/dist/gitConflictParser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseGitConflicts = parseGitConflicts2;
    exports2.parseGitConflictsWithDiagnostics = parseGitConflictsWithDiagnostics2;
    exports2.hasGitConflictMarkers = hasGitConflictMarkers3;
    var GIT_BEGIN = /^<<<<<<< (.+)$/;
    var GIT_SEP = /^=======\s*$/;
    var GIT_END = /^>>>>>>> (.+)$/;
    function parseGitConflicts2(text) {
      return parseGitConflictsWithDiagnostics2(text).blocks;
    }
    function parseGitConflictsWithDiagnostics2(text) {
      const lines = text.split(/\r?\n/);
      const blocks = [];
      const warnings = [];
      let i = 0;
      while (i < lines.length) {
        const beginMatch = GIT_BEGIN.exec(lines[i]);
        if (!beginMatch) {
          i += 1;
          continue;
        }
        const startLine = i;
        const oursRef = beginMatch[1].trim();
        i += 1;
        const oursLines = [];
        while (i < lines.length) {
          const line = lines[i];
          if (GIT_SEP.test(line)) {
            break;
          }
          if (GIT_BEGIN.exec(line)) {
            warnings.push(`Nested Git conflict marker inside "ours" hunk starting at line ${startLine + 1} (line ${i + 1})`);
          }
          oursLines.push(line);
          i += 1;
        }
        if (i >= lines.length) {
          warnings.push(`Unterminated Git conflict (missing =======) starting at line ${startLine + 1}`);
          break;
        }
        i += 1;
        const theirsLines = [];
        let closed = false;
        while (i < lines.length) {
          const line = lines[i];
          const endMatch = GIT_END.exec(line);
          if (endMatch) {
            const theirsRef = endMatch[1].trim();
            blocks.push({
              startLine,
              endLine: i,
              kind: "git merge",
              baseKind: "git merge",
              tags: {},
              segments: [
                {
                  label: oursRef,
                  lines: oursLines,
                  metadata: { raw: oursRef, baseKind: oursRef, tags: {} }
                },
                {
                  label: theirsRef,
                  lines: theirsLines,
                  metadata: { raw: theirsRef, baseKind: theirsRef, tags: {} }
                }
              ]
            });
            i += 1;
            closed = true;
            break;
          }
          if (GIT_BEGIN.exec(line)) {
            warnings.push(`Nested Git conflict marker inside "theirs" hunk starting at line ${startLine + 1} (line ${i + 1})`);
          }
          theirsLines.push(line);
          i += 1;
        }
        if (!closed) {
          warnings.push(`Unterminated Git conflict (missing >>>>>>>) starting at line ${startLine + 1}`);
        }
      }
      return { blocks, warnings };
    }
    function hasGitConflictMarkers3(text) {
      return /^<<<<<<< /m.test(text);
    }
  }
});

// ../../packages/tonic-core/dist/gitExec.js
var require_gitExec = __commonJS({
  "../../packages/tonic-core/dist/gitExec.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.gitExec = gitExec;
    exports2.gitRequireOk = gitRequireOk;
    var node_child_process_1 = require("node:child_process");
    function gitExec(repoRoot, args) {
      const r = (0, node_child_process_1.spawnSync)("git", ["-C", repoRoot, ...args], {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
      });
      return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    }
    function gitRequireOk(repoRoot, args, errCtx) {
      const { code, stdout, stderr } = gitExec(repoRoot, args);
      if (code !== 0) {
        throw new Error(`${errCtx}: git ${args.join(" ")}
${stderr || stdout}`);
      }
      return stdout;
    }
  }
});

// ../../packages/tonic-core/dist/authorAliasResolver.js
var require_authorAliasResolver = __commonJS({
  "../../packages/tonic-core/dist/authorAliasResolver.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseGitAuthorNameEmail = parseGitAuthorNameEmail;
    exports2.humanAliasFromGitStdout = humanAliasFromGitStdout;
    exports2.resolveAuthorAliasForSide = resolveAuthorAliasForSide;
    exports2.createDefaultGitAuthorProbe = createDefaultGitAuthorProbe;
    var gitExec_1 = require_gitExec();
    var markerLabel_1 = require_markerLabel();
    var DEFAULT_LEFT = "base";
    var DEFAULT_RIGHT = "head";
    function emailLocalPart(email) {
      const at = email.indexOf("@");
      const local = at >= 0 ? email.slice(0, at) : email;
      return (0, markerLabel_1.sanitizeAuthorTagToken)(local);
    }
    function parseGitAuthorNameEmail(stdout) {
      const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
      const name = (lines[0] ?? "").trim();
      const email = (lines[1] ?? "").trim();
      return { name, email };
    }
    function humanAliasFromGitStdout(stdout) {
      const { name, email } = parseGitAuthorNameEmail(stdout);
      if (name) {
        return (0, markerLabel_1.sanitizeAuthorTagToken)(name);
      }
      if (email) {
        return emailLocalPart(email);
      }
      return DEFAULT_LEFT;
    }
    function resolveAuthorAliasForSide(side, p) {
      const explicit = side === "left" ? p.explicitLeft : p.explicitRight;
      if (explicit?.trim()) {
        return (0, markerLabel_1.sanitizeAuthorTagToken)(explicit);
      }
      const gh = side === "left" ? p.githubLoginLeft : p.githubLoginRight;
      if (gh?.trim()) {
        return (0, markerLabel_1.sanitizeAuthorTagToken)(gh);
      }
      const ref = side === "left" ? p.leftRef : p.rightRef;
      if (p.mode === "ref" && ref.trim()) {
        return (0, markerLabel_1.sanitizeAuthorTagToken)(ref.replace(/^refs\/heads\//, ""));
      }
      if (p.mode === "human" && p.gitProbe && ref.trim()) {
        const { stdout, code } = p.gitProbe(p.repoRoot, ref);
        if (code === 0 && stdout.trim()) {
          return humanAliasFromGitStdout(stdout);
        }
      }
      return side === "left" ? DEFAULT_LEFT : DEFAULT_RIGHT;
    }
    function createDefaultGitAuthorProbe(repoRoot) {
      return (_root, ref) => (0, gitExec_1.gitExec)(repoRoot, ["show", "-s", "--format=%an%n%ae", ref]);
    }
  }
});

// ../../packages/tonic-core/dist/mergeUtils.js
var require_mergeUtils = __commonJS({
  "../../packages/tonic-core/dist/mergeUtils.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.mergeSnapshots = mergeSnapshots2;
    exports2.annotatedToConflictFile = annotatedToConflictFile;
    exports2.conflictRegionsToAnnotatedLines = conflictRegionsToAnnotatedLines3;
    exports2.conflictFileFromBlocks = conflictFileFromBlocks;
    exports2.heuristicResolvedLines = heuristicResolvedLines;
    exports2.suggestionLineCountOk = suggestionLineCountOk;
    exports2.applyTonicResolutions = applyTonicResolutions;
    exports2.applyTonicHeuristic = applyTonicHeuristic;
    exports2.hydrateTonicAnnotatedAuthorIntent = hydrateTonicAnnotatedAuthorIntent;
    var core_1 = require_core();
    var conflictParser_1 = require_conflictParser();
    var markerLabel_1 = require_markerLabel();
    function mergeSnapshots2(leftLines, rightLines, opts) {
      const [mergedState, annotated] = (0, core_1.mergeStates)((0, core_1.initialState)(leftLines, opts?.leftCommitId), (0, core_1.initialState)(rightLines, opts?.rightCommitId));
      return [(0, core_1.currentLines)(mergedState), annotated];
    }
    function annotatedToConflictFile(path2, annotatedLines) {
      const text = annotatedLines.join("\n");
      const conflicts = [];
      let i = 0;
      const n = annotatedLines.length;
      while (i < n) {
        const line = annotatedLines[i];
        if (!line.startsWith("<<<<<<< begin ")) {
          i += 1;
          continue;
        }
        const kind = line.slice("<<<<<<< begin ".length).trim();
        const kindMeta = (0, markerLabel_1.parseConflictLabel)(kind);
        const startLine = i + 1;
        i += 1;
        const inner = [];
        while (i < n && !annotatedLines[i].startsWith(">>>>>>> end conflict")) {
          inner.push(annotatedLines[i]);
          i += 1;
        }
        const endLine = i < n ? i + 1 : n;
        const leftLines = [];
        const rightLines = [];
        let seenMid = false;
        let midMarkerLabel = "";
        for (const cl of inner) {
          if (cl.startsWith("======= begin ")) {
            midMarkerLabel = cl.slice("======= begin ".length).trim();
            seenMid = true;
            continue;
          }
          if (!seenMid) {
            leftLines.push(cl);
          } else {
            rightLines.push(cl);
          }
        }
        const sameLabels = !midMarkerLabel || midMarkerLabel === kind;
        conflicts.push({
          baseContent: "",
          leftContent: leftLines.join("\n"),
          rightContent: rightLines.join("\n"),
          startLine,
          endLine,
          conflictKind: kind,
          conflictBaseKind: kindMeta.baseKind,
          conflictTags: { ...kindMeta.tags },
          markerLabelBegin: sameLabels ? void 0 : kind,
          markerLabelMid: sameLabels ? void 0 : midMarkerLabel || void 0
        });
        if (i < n && annotatedLines[i].startsWith(">>>>>>> end conflict")) {
          i += 1;
        }
      }
      return { path: path2, conflicts, content: text, leftLabel: "left", rightLabel: "right" };
    }
    function conflictRegionsToAnnotatedLines3(regions) {
      const out = [];
      for (const r of regions) {
        const kind = (r.conflictKind ?? "").trim() || "added both";
        const conflictKind = r.conflictBaseKind || r.conflictTags ? (0, markerLabel_1.formatConflictLabel)(r.conflictBaseKind ?? (0, markerLabel_1.parseConflictLabel)(kind).baseKind, r.conflictTags ?? {}) : (0, markerLabel_1.normalizeConflictLabel)(kind);
        const beginLabel = r.markerLabelBegin ?? conflictKind;
        const midLabel = r.markerLabelMid ?? r.markerLabelBegin ?? conflictKind;
        out.push(`<<<<<<< begin ${beginLabel}`);
        const left = r.leftContent ? r.leftContent.split(/\r?\n/) : [];
        const right = r.rightContent ? r.rightContent.split(/\r?\n/) : [];
        for (const ln of left) {
          out.push(ln);
        }
        out.push(`======= begin ${midLabel}`);
        for (const ln of right) {
          out.push(ln);
        }
        out.push(">>>>>>> end conflict");
      }
      return out;
    }
    function conflictFileFromBlocks(path2, text, blocks) {
      return {
        path: path2,
        content: text,
        leftLabel: "left",
        rightLabel: "right",
        conflicts: blocks.map((b) => {
          const leftLines = b.segments[0]?.lines ?? [];
          const rightLines = b.segments[1]?.lines ?? [];
          return {
            baseContent: "",
            leftContent: leftLines.join("\n"),
            rightContent: rightLines.join("\n"),
            startLine: b.startLine + 1,
            endLine: b.endLine + 1,
            conflictKind: b.kind,
            conflictBaseKind: b.baseKind,
            conflictTags: { ...b.tags }
          };
        })
      };
    }
    function heuristicResolvedLines(region) {
      const rc = region.rightContent ? region.rightContent.split(/\r?\n/) : [];
      if (rc.length) {
        return rc;
      }
      return region.leftContent ? region.leftContent.split(/\r?\n/) : [];
    }
    function suggestionLineCountOk(resolved, spanLen) {
      return resolved.length === spanLen;
    }
    function applyTonicResolutions(annotatedLines, resolvedPerRegion) {
      const cf = annotatedToConflictFile("_", annotatedLines);
      if (resolvedPerRegion.length !== cf.conflicts.length) {
        throw new Error(`applyTonicResolutions: expected ${cf.conflicts.length} region resolutions, got ${resolvedPerRegion.length}`);
      }
      const order = cf.conflicts.map((r, i) => ({ r, i })).sort((a, b) => b.r.startLine - a.r.startLine);
      const lines = [...annotatedLines];
      for (const { r, i } of order) {
        const start = r.startLine - 1;
        const deleteCount = r.endLine - r.startLine + 1;
        lines.splice(start, deleteCount, ...resolvedPerRegion[i]);
      }
      return lines;
    }
    function applyTonicHeuristic(annotatedLines) {
      const cf = annotatedToConflictFile("_", annotatedLines);
      const resolved = cf.conflicts.map((c) => heuristicResolvedLines(c));
      return applyTonicResolutions(annotatedLines, resolved);
    }
    function blockToHydratedRegion(block, opts) {
      if (block.segments.length < 2) {
        const seg02 = block.segments[0];
        const t02 = { ...seg02?.metadata.tags ?? {} };
        if (!t02.author)
          t02.author = opts.leftAuthor;
        if (!t02.intent)
          t02.intent = opts.leftIntent;
        const base = seg02?.metadata.baseKind ?? block.baseKind;
        return {
          baseContent: "",
          leftContent: seg02?.lines.join("\n") ?? "",
          rightContent: "",
          startLine: block.startLine + 1,
          endLine: block.endLine + 1,
          conflictKind: (0, markerLabel_1.formatConflictLabel)(base, t02),
          conflictBaseKind: base,
          conflictTags: { ...t02 }
        };
      }
      const seg0 = block.segments[0];
      const seg1 = block.segments[1];
      const t0 = { ...seg0.metadata.tags };
      const t1 = { ...seg1.metadata.tags };
      if (!t0.author)
        t0.author = opts.leftAuthor;
      if (!t0.intent)
        t0.intent = opts.leftIntent;
      if (!t1.author)
        t1.author = opts.rightAuthor;
      if (!t1.intent)
        t1.intent = opts.rightIntent;
      const mlBegin = (0, markerLabel_1.formatConflictLabel)(seg0.metadata.baseKind, t0);
      const mlMid = (0, markerLabel_1.formatConflictLabel)(seg1.metadata.baseKind, t1);
      const same = mlBegin === mlMid;
      return {
        baseContent: "",
        leftContent: seg0.lines.join("\n"),
        rightContent: seg1.lines.join("\n"),
        startLine: block.startLine + 1,
        endLine: block.endLine + 1,
        conflictKind: block.kind,
        conflictBaseKind: block.baseKind,
        conflictTags: { ...block.tags },
        markerLabelBegin: same ? void 0 : mlBegin,
        markerLabelMid: same ? void 0 : mlMid
      };
    }
    function hydrateTonicAnnotatedAuthorIntent(annotatedLines, opts) {
      const text = annotatedLines.join("\n");
      const { blocks } = (0, conflictParser_1.parseTonicConflictsWithDiagnostics)(text);
      if (blocks.length === 0) {
        return annotatedLines;
      }
      const out = [];
      let lineIdx = 0;
      for (const b of blocks) {
        while (lineIdx < b.startLine) {
          out.push(annotatedLines[lineIdx]);
          lineIdx++;
        }
        const region = blockToHydratedRegion(b, opts);
        out.push(...conflictRegionsToAnnotatedLines3([region]));
        lineIdx = b.endLine + 1;
      }
      while (lineIdx < annotatedLines.length) {
        out.push(annotatedLines[lineIdx]);
        lineIdx++;
      }
      return out;
    }
  }
});

// ../../packages/tonic-core/dist/markerInterop.js
var require_markerInterop = __commonJS({
  "../../packages/tonic-core/dist/markerInterop.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT = exports2.DEFAULT_GIT_MERGE_LEFT_INTENT = void 0;
    exports2.gitConflictBlocksToConflictRegions = gitConflictBlocksToConflictRegions;
    exports2.gitConflictBlocksToTonicAnnotatedPreview = gitConflictBlocksToTonicAnnotatedPreview2;
    exports2.gitMergeFileOutputToTonicAnnotatedLines = gitMergeFileOutputToTonicAnnotatedLines;
    var authorAliasResolver_1 = require_authorAliasResolver();
    var gitConflictParser_1 = require_gitConflictParser();
    var markerLabel_1 = require_markerLabel();
    var mergeUtils_1 = require_mergeUtils();
    var GIT_MERGE_KIND = "git merge";
    exports2.DEFAULT_GIT_MERGE_LEFT_INTENT = "preserve_base";
    exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT = "prefer_head";
    function mergeHydrationDefaults(opts) {
      return {
        authorMode: opts?.authorMode ?? "base-head",
        leftIntent: opts?.leftIntent ?? exports2.DEFAULT_GIT_MERGE_LEFT_INTENT,
        rightIntent: opts?.rightIntent ?? exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT,
        ...opts
      };
    }
    function gitConflictBlocksToConflictRegions(blocks, opts) {
      const o = mergeHydrationDefaults(opts);
      const repoRoot = o.repoRoot ?? process.cwd();
      const leftRef = o.leftRef ?? "";
      const rightRef = o.rightRef ?? "";
      const mode = o.authorMode ?? "base-head";
      const gitProbe = mode === "human" && o.repoRoot !== void 0 ? (0, authorAliasResolver_1.createDefaultGitAuthorProbe)(repoRoot) : void 0;
      return blocks.map((b) => {
        const leftLines = b.segments[0]?.lines ?? [];
        const rightLines = b.segments[1]?.lines ?? [];
        const leftAuth = (0, authorAliasResolver_1.resolveAuthorAliasForSide)("left", {
          repoRoot,
          mode,
          leftRef,
          rightRef,
          explicitLeft: o.explicitLeftAuthor,
          explicitRight: o.explicitRightAuthor,
          githubLoginLeft: o.githubLoginLeft,
          githubLoginRight: o.githubLoginRight,
          gitProbe
        });
        const rightAuth = (0, authorAliasResolver_1.resolveAuthorAliasForSide)("right", {
          repoRoot,
          mode,
          leftRef,
          rightRef,
          explicitLeft: o.explicitLeftAuthor,
          explicitRight: o.explicitRightAuthor,
          githubLoginLeft: o.githubLoginLeft,
          githubLoginRight: o.githubLoginRight,
          gitProbe
        });
        const leftIntent = (o.leftIntent ?? exports2.DEFAULT_GIT_MERGE_LEFT_INTENT).trim() || exports2.DEFAULT_GIT_MERGE_LEFT_INTENT;
        const rightIntent = (o.rightIntent ?? exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT).trim() || exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT;
        const mlBegin = (0, markerLabel_1.formatConflictLabel)(GIT_MERGE_KIND, { author: leftAuth, intent: leftIntent });
        const mlMid = (0, markerLabel_1.formatConflictLabel)(GIT_MERGE_KIND, { author: rightAuth, intent: rightIntent });
        return {
          baseContent: "",
          leftContent: leftLines.join("\n"),
          rightContent: rightLines.join("\n"),
          startLine: b.startLine + 1,
          endLine: b.endLine + 1,
          conflictKind: GIT_MERGE_KIND,
          conflictBaseKind: GIT_MERGE_KIND,
          conflictTags: {
            author: leftAuth,
            intent: leftIntent,
            author_right: rightAuth,
            intent_right: rightIntent
          },
          markerLabelBegin: mlBegin,
          markerLabelMid: mlMid
        };
      });
    }
    function gitConflictBlocksToTonicAnnotatedPreview2(blocks, opts) {
      const regions = gitConflictBlocksToConflictRegions(blocks, opts);
      return (0, mergeUtils_1.conflictRegionsToAnnotatedLines)(regions.map((r) => ({ ...r, conflictKind: GIT_MERGE_KIND })));
    }
    function gitMergeFileOutputToTonicAnnotatedLines(mergedGit, opts) {
      const rawLines = mergedGit.split(/\r?\n/);
      if (rawLines.length && rawLines[rawLines.length - 1] === "") {
        rawLines.pop();
      }
      const { blocks } = (0, gitConflictParser_1.parseGitConflictsWithDiagnostics)(mergedGit);
      if (blocks.length === 0) {
        return rawLines;
      }
      const regions = gitConflictBlocksToConflictRegions(blocks, opts);
      const tonicChunks = regions.map((r) => (0, mergeUtils_1.conflictRegionsToAnnotatedLines)([{ ...r, conflictKind: GIT_MERGE_KIND }]));
      const out = [];
      let idx = 0;
      for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        while (idx < b.startLine) {
          out.push(rawLines[idx]);
          idx++;
        }
        out.push(...tonicChunks[bi]);
        idx = b.endLine + 1;
      }
      while (idx < rawLines.length) {
        out.push(rawLines[idx]);
        idx++;
      }
      return out;
    }
  }
});

// ../../packages/tonic-core/dist/intentInteractive.js
var require_intentInteractive = __commonJS({
  "../../packages/tonic-core/dist/intentInteractive.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_INTENT_PROFILE_PATH = void 0;
    exports2.loadIntentProfile = loadIntentProfile;
    exports2.saveIntentProfile = saveIntentProfile;
    exports2.parseIntentPair = parseIntentPair;
    exports2.promptIntentPairInteractive = promptIntentPairInteractive;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var readline = __importStar(require("node:readline/promises"));
    var markerInterop_1 = require_markerInterop();
    exports2.DEFAULT_INTENT_PROFILE_PATH = ".tonic/intent-profile.json";
    function loadIntentProfile(filePath) {
      try {
        const raw = fs2.readFileSync(filePath, "utf8");
        const j = JSON.parse(raw);
        if (j && typeof j === "object") {
          return { version: 1, leftIntent: j.leftIntent, rightIntent: j.rightIntent };
        }
      } catch {
        return null;
      }
      return null;
    }
    function saveIntentProfile(filePath, profile) {
      const abs = path2.resolve(filePath);
      fs2.mkdirSync(path2.dirname(abs), { recursive: true });
      fs2.writeFileSync(abs, JSON.stringify({ version: 1, leftIntent: profile.leftIntent, rightIntent: profile.rightIntent }, null, 2) + "\n", "utf8");
    }
    function parseIntentPair(raw) {
      const s = raw.trim();
      if (!s) {
        return null;
      }
      const idx = s.indexOf(",");
      if (idx < 0) {
        return null;
      }
      const left = s.slice(0, idx).trim();
      const right = s.slice(idx + 1).trim();
      if (!left || !right) {
        return null;
      }
      return { left, right };
    }
    async function promptIntentPairInteractive(params) {
      const input = params.input ?? process.stdin;
      const output = params.output ?? process.stdout;
      const dl = params.defaultLeft ?? markerInterop_1.DEFAULT_GIT_MERGE_LEFT_INTENT;
      const dr = params.defaultRight ?? markerInterop_1.DEFAULT_GIT_MERGE_RIGHT_INTENT;
      const rl = readline.createInterface({ input, output });
      try {
        const leftRaw = (await rl.question(`Left (base) intent [${dl}]: `)).trim();
        const rightRaw = (await rl.question(`Right (head) intent [${dr}]: `)).trim();
        return {
          leftIntent: leftRaw || dl,
          rightIntent: rightRaw || dr
        };
      } finally {
        rl.close();
      }
    }
  }
});

// ../../packages/tonic-core/dist/astGrep/types.js
var require_types = __commonJS({
  "../../packages/tonic-core/dist/astGrep/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.EXIT_PARTIAL = exports2.EXIT_SCAN_FAILED = exports2.EXIT_INVALID_ARGS = exports2.EXIT_AST_GREP_MISSING = exports2.EXIT_OK = void 0;
    exports2.EXIT_OK = 0;
    exports2.EXIT_AST_GREP_MISSING = 10;
    exports2.EXIT_INVALID_ARGS = 11;
    exports2.EXIT_SCAN_FAILED = 12;
    exports2.EXIT_PARTIAL = 13;
  }
});

// ../../packages/tonic-core/dist/astGrep/artifact.js
var require_artifact = __commonJS({
  "../../packages/tonic-core/dist/astGrep/artifact.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildAstHydrationJson = buildAstHydrationJson;
    exports2.buildRunJson = buildRunJson;
    exports2.writeUtf8Json = writeUtf8Json;
    exports2.summarizeAstInputs = summarizeAstInputs;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    function stableStringify(obj) {
      return JSON.stringify(obj, null, 2) + "\n";
    }
    function buildAstHydrationJson(params) {
      const files = new Set(params.matches.map((m) => m.path));
      return {
        schema: "tonic-ast-hydration",
        version: "1",
        tool: "ast-grep",
        tool_version: params.toolVersion,
        repo_root: params.repoRoot.replace(/\\/g, "/"),
        scan_scope: params.scanScope,
        ruleset: params.ruleset,
        languages: params.languages,
        summary: {
          match_count: params.matches.length,
          files_with_matches: files.size,
          truncated: params.truncated
        },
        matches: params.matches
      };
    }
    function buildRunJson(params) {
      return {
        schema: "tonic-hydration-run",
        version: "1",
        run_id: params.runId,
        status: params.status,
        exit_code: params.exitCode,
        errors: params.errors,
        warnings: params.warnings,
        inputs: params.inputs,
        timing_ms: params.timingMs,
        ast_evidence_path: params.astEvidencePath,
        retrieval_path: null,
        tags_patch_path: null,
        code_walk_trace_path: null,
        intent_hydration_path: null,
        intent_bootstrap_path: null,
        question_refinement_path: null,
        conflict_context_path: null,
        repo_structure_path: null,
        prior_run_path: null,
        pipeline: params.pipeline
      };
    }
    function writeUtf8Json(filePath, obj) {
      const abs = path2.resolve(filePath);
      fs2.mkdirSync(path2.dirname(abs), { recursive: true });
      fs2.writeFileSync(abs, stableStringify(obj), "utf8");
    }
    function summarizeAstInputs(opts) {
      return {
        repo: opts.repoRoot,
        ruleset: opts.ruleset,
        config: opts.configPath || null,
        rule: opts.rulePath || null,
        languages: opts.languages,
        changed_only: opts.changedOnly,
        max_matches_per_file: opts.maxMatchesPerFile,
        max_matches_per_rule: opts.maxMatchesPerRule
      };
    }
  }
});

// ../../packages/tonic-core/dist/astGrep/discovery.js
var require_discovery = __commonJS({
  "../../packages/tonic-core/dist/astGrep/discovery.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveAstGrepBinary = resolveAstGrepBinary;
    exports2.readAstGrepVersion = readAstGrepVersion;
    var node_child_process_1 = require("node:child_process");
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    function tryWhich(cmd) {
      const isWin = process.platform === "win32";
      const which = isWin ? "where" : "which";
      const r = (0, node_child_process_1.spawnSync)(which, [cmd], { encoding: "utf8", shell: isWin });
      if (r.status !== 0 || !r.stdout) {
        return null;
      }
      const line = r.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
      return line?.trim() || null;
    }
    function resolveAstGrepBinary(opts) {
      const fromFlag = opts.astGrepBin.trim();
      if (fromFlag) {
        const looksLikePath = fromFlag.includes("/") || fromFlag.includes("\\") || fromFlag.endsWith(".js") || fromFlag.endsWith(".exe") || path2.isAbsolute(fromFlag);
        if (looksLikePath && !fs2.existsSync(fromFlag)) {
          return null;
        }
        if (fs2.existsSync(fromFlag) || fromFlag.includes("/") || fromFlag.includes("\\")) {
          return fromFlag;
        }
        const w = tryWhich(fromFlag);
        if (w) {
          return w;
        }
        return fromFlag;
      }
      const env3 = (process.env.TONIC_AST_GREP_BIN ?? "").trim();
      if (env3) {
        return env3;
      }
      const sg = tryWhich("sg");
      if (sg) {
        return sg;
      }
      const ag = tryWhich("ast-grep");
      return ag;
    }
    function readAstGrepVersion(bin) {
      if (bin.endsWith(".js")) {
        return "fixture-js";
      }
      const r = (0, node_child_process_1.spawnSync)(bin, ["--version"], { encoding: "utf8", timeout: 1e4 });
      if (r.status !== 0) {
        return "unknown";
      }
      return (r.stdout || r.stderr || "").split(/\r?\n/)[0]?.trim() || "unknown";
    }
  }
});

// ../../packages/tonic-core/dist/astGrep/languageMap.js
var require_languageMap = __commonJS({
  "../../packages/tonic-core/dist/astGrep/languageMap.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.extensionToLanguage = extensionToLanguage;
    exports2.parseLanguagesParam = parseLanguagesParam;
    exports2.fileMatchesLanguageFilter = fileMatchesLanguageFilter;
    var EXT_TO_LANG = {
      ts: "typescript",
      tsx: "tsx",
      mts: "typescript",
      cts: "typescript",
      js: "javascript",
      jsx: "jsx",
      mjs: "javascript",
      cjs: "javascript",
      py: "python",
      pyi: "python",
      yml: "yaml",
      yaml: "yaml",
      json: "json",
      toml: "toml",
      rs: "rust",
      go: "go",
      java: "java",
      c: "c",
      h: "c",
      cpp: "cpp",
      cc: "cpp",
      cxx: "cpp",
      hpp: "cpp",
      cs: "csharp",
      csx: "csharp"
    };
    function extensionToLanguage(ext) {
      const e = ext.replace(/^\./, "").toLowerCase();
      return EXT_TO_LANG[e] ?? null;
    }
    function parseLanguagesParam(raw) {
      const s = raw.trim().toLowerCase();
      if (!s || s === "auto") {
        return "auto";
      }
      return s.split(",").map((x) => x.trim()).filter(Boolean);
    }
    function fileMatchesLanguageFilter(relPath, languages3) {
      const base = relPath.split(/[/\\]/).pop() ?? "";
      const dot = base.lastIndexOf(".");
      const ext = dot >= 0 ? base.slice(dot + 1) : "";
      const lang = extensionToLanguage(ext);
      if (languages3 === "auto") {
        return { ok: lang != null, language: lang };
      }
      if (!lang) {
        return { ok: false, language: null };
      }
      return { ok: languages3.includes(lang), language: lang };
    }
  }
});

// ../../packages/tonic-core/dist/astGrep/normalize.js
var require_normalize = __commonJS({
  "../../packages/tonic-core/dist/astGrep/normalize.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.toRepoRelativePosix = toRepoRelativePosix;
    exports2.mapRawMatch = mapRawMatch;
    exports2.stableSortMatches = stableSortMatches;
    exports2.matchGlob = matchGlob;
    exports2.pathMatchesGlobs = pathMatchesGlobs;
    exports2.applyCaps = applyCaps;
    var path2 = __importStar(require("node:path"));
    function toRepoRelativePosix(absOrRel, repoRoot) {
      const norm = absOrRel.replace(/\\/g, "/");
      const root = path2.resolve(repoRoot).replace(/\\/g, "/");
      let p = path2.resolve(repoRoot, absOrRel).replace(/\\/g, "/");
      if (p.startsWith(root + "/") || p === root) {
        p = p.slice(root.length).replace(/^\//, "");
      } else if (!norm.includes("..")) {
        return norm.replace(/^\.\//, "");
      }
      return p;
    }
    function readPos(obj, key) {
      if (!obj || typeof obj !== "object") {
        return void 0;
      }
      const o = obj;
      const v = o[key];
      if (!v || typeof v !== "object") {
        return void 0;
      }
      const r = v;
      const line = typeof r.line === "number" ? r.line : Number(r.line);
      const column = typeof r.column === "number" ? r.column : Number(r.column ?? 0);
      if (!Number.isFinite(line) || line < 1) {
        return void 0;
      }
      return { line, column: Number.isFinite(column) ? column : 0 };
    }
    function extractRuleId(raw) {
      const v = raw.ruleId ?? raw.rule_id ?? raw.id ?? raw.rule?.id ?? "unknown";
      return String(v);
    }
    function extractPath(raw, repoRoot) {
      const p = raw.path ?? raw.file ?? raw.filename ?? "";
      const s = String(p);
      if (!s) {
        return "";
      }
      return toRepoRelativePosix(s, repoRoot);
    }
    function extractLanguage(raw) {
      const l = raw.language ?? raw.lang ?? "";
      return String(l || "unknown");
    }
    function extractRange(raw) {
      const range = raw.range;
      if (range && typeof range === "object") {
        const r = range;
        const start = readPos(r, "start") ?? readPos(raw, "start");
        const end = readPos(r, "end") ?? readPos(raw, "end");
        return { start, end };
      }
      return {
        start: readPos(raw, "start"),
        end: readPos(raw, "end")
      };
    }
    function mapRawMatch(raw, repoRoot) {
      if (!raw || typeof raw !== "object") {
        return null;
      }
      const o = raw;
      const rel = extractPath(o, repoRoot);
      if (!rel) {
        return null;
      }
      const { start, end } = extractRange(o);
      const rule_id = extractRuleId(o);
      const text = o.text != null ? String(o.text) : "";
      const message = o.message != null ? String(o.message) : text.slice(0, 200);
      const sev = o.severity;
      const severity = sev === "error" || sev === "warning" || sev === "info" ? sev : "info";
      const meta = {};
      if (o.note) {
        meta.note = o.note;
      }
      if (o.labels) {
        meta.labels = o.labels;
      }
      return {
        rule_id,
        severity,
        language: extractLanguage(o),
        path: rel,
        start,
        end,
        message,
        meta
      };
    }
    function stableSortMatches(matches) {
      return [...matches].sort((a, b) => {
        const pa = a.path.localeCompare(b.path);
        if (pa !== 0) {
          return pa;
        }
        const la = a.start?.line ?? 0;
        const lb = b.start?.line ?? 0;
        if (la !== lb) {
          return la - lb;
        }
        const ca = a.start?.column ?? 0;
        const cb = b.start?.column ?? 0;
        if (ca !== cb) {
          return ca - cb;
        }
        return a.rule_id.localeCompare(b.rule_id);
      });
    }
    function matchGlob(relPath, pattern) {
      const r = relPath.replace(/\\/g, "/");
      const f = pattern.replace(/\\/g, "/");
      if (!f.includes("*") && !f.includes("?")) {
        return r === f || r.endsWith("/" + f);
      }
      const esc = f.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "<<<GLOBSTAR>>>").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/<<<GLOBSTAR>>>/g, ".*");
      try {
        return new RegExp(`^${esc}$`).test(r);
      } catch {
        return false;
      }
    }
    function pathMatchesGlobs(relPath, include, exclude) {
      const r = relPath.replace(/\\/g, "/");
      const inc = include.length === 0 ? ["**/*"] : include;
      if (!inc.some((g) => matchGlob(r, g))) {
        return false;
      }
      if (exclude.some((g) => matchGlob(r, g))) {
        return false;
      }
      return true;
    }
    function applyCaps(matches, maxPerFile, maxPerRule) {
      const warnings = [];
      if (maxPerFile <= 0 && maxPerRule <= 0) {
        return { matches, warnings, truncated: false };
      }
      const byFile = /* @__PURE__ */ new Map();
      const byRule = /* @__PURE__ */ new Map();
      const out = [];
      let truncated = false;
      for (const m of matches) {
        const fc = (byFile.get(m.path) ?? 0) + 1;
        const rc = (byRule.get(m.rule_id) ?? 0) + 1;
        if (maxPerFile > 0 && fc > maxPerFile) {
          truncated = true;
          continue;
        }
        if (maxPerRule > 0 && rc > maxPerRule) {
          truncated = true;
          continue;
        }
        byFile.set(m.path, fc);
        byRule.set(m.rule_id, rc);
        out.push(m);
      }
      if (truncated) {
        warnings.push({
          code: "matches_truncated",
          message: "Match list truncated by per-file or per-rule caps"
        });
      }
      return { matches: stableSortMatches(out), warnings, truncated };
    }
  }
});

// ../../packages/tonic-core/dist/astGrep/runner.js
var require_runner = __commonJS({
  "../../packages/tonic-core/dist/astGrep/runner.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.toRepoRelativePosix = void 0;
    exports2.collectScanPaths = collectScanPaths;
    exports2.runAstGrepScan = runAstGrepScan;
    var node_child_process_1 = require("node:child_process");
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var discovery_1 = require_discovery();
    var languageMap_1 = require_languageMap();
    var normalize_1 = require_normalize();
    Object.defineProperty(exports2, "toRepoRelativePosix", { enumerable: true, get: function() {
      return normalize_1.toRepoRelativePosix;
    } });
    function parseSgJsonStdout(stdout) {
      const t = stdout.trim();
      if (!t) {
        return [];
      }
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) {
          return j;
        }
        if (j && typeof j === "object") {
          return [j];
        }
      } catch {
      }
      const lines = stdout.split(/\r?\n/);
      const out = [];
      for (const line of lines) {
        const s = line.trim();
        if (!s) {
          continue;
        }
        try {
          out.push(JSON.parse(s));
        } catch {
        }
      }
      return out;
    }
    function listRepoFiles(repoRoot) {
      const out = [];
      function walk(dir, base) {
        let entries;
        try {
          entries = fs2.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (e.name === ".git" || e.name === "node_modules" || e.name === ".tonic") {
            continue;
          }
          const rel = path2.join(base, e.name).replace(/\\/g, "/");
          const full = path2.join(dir, e.name);
          if (e.isDirectory()) {
            walk(full, rel);
          } else if (e.isFile()) {
            out.push(rel);
          }
        }
      }
      walk(repoRoot, "");
      return out.sort();
    }
    function getGitChangedFiles(repoRoot) {
      const r = (0, node_child_process_1.spawnSync)("git", ["-C", repoRoot, "diff", "--name-only", "HEAD"], {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
      });
      if (r.status !== 0) {
        return null;
      }
      return (r.stdout ?? "").split(/\r?\n/).map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean);
    }
    function buildScanArgv(opts, scanPaths) {
      const args = ["scan", "--json"];
      if (opts.configPath) {
        args.push("--config", opts.configPath);
      } else if (opts.rulePath) {
        args.push("--rule", opts.rulePath);
      } else if (opts.inlineRule) {
        args.push("--inline-rules", opts.inlineRule);
      }
      args.push(...opts.extraArgs);
      if (scanPaths.length === 0) {
        args.push(".");
      } else {
        args.push(...scanPaths);
      }
      return args;
    }
    function collectScanPaths(opts) {
      const warnings = [];
      const langs = (0, languageMap_1.parseLanguagesParam)(opts.languages);
      let candidates;
      if (opts.changedOnly) {
        const ch = getGitChangedFiles(opts.repoRoot);
        if (ch == null) {
          warnings.push({
            code: "git_diff_failed",
            message: "Could not list changed files; scanning full repo tree"
          });
          candidates = listRepoFiles(opts.repoRoot);
        } else {
          candidates = ch;
        }
      } else {
        candidates = listRepoFiles(opts.repoRoot);
      }
      const include = opts.includeGlobs;
      const exclude = opts.excludeGlobs;
      const out = [];
      for (const rel of candidates) {
        if (!(0, normalize_1.pathMatchesGlobs)(rel, include, exclude)) {
          continue;
        }
        const { ok } = (0, languageMap_1.fileMatchesLanguageFilter)(rel, langs);
        if (!ok) {
          continue;
        }
        out.push(rel);
      }
      return { paths: out, warnings };
    }
    function runAstGrepScan(opts) {
      const bin = (0, discovery_1.resolveAstGrepBinary)(opts);
      if (!bin) {
        return {
          kind: "missing_binary",
          message: "ast-grep (sg) not found. Install from https://ast-grep.github.io/ or set TONIC_AST_GREP_BIN / --ast-grep-bin"
        };
      }
      if (!opts.configPath && !opts.rulePath && !opts.inlineRule) {
        return { kind: "invalid_args", message: "Need one of --config, --rule, or --inline-rule (or --ruleset default)" };
      }
      const { paths: scanPaths, warnings: pathWarnings } = collectScanPaths(opts);
      const absPaths = scanPaths.map((p) => path2.join(opts.repoRoot, p));
      const timeoutMs = Number(process.env.TONIC_AST_GREP_TIMEOUT_MS ?? "300000") || 3e5;
      const argv = buildScanArgv(opts, absPaths.length > 0 ? absPaths : [opts.repoRoot]);
      const spawnBin = bin.endsWith(".js") ? process.execPath : bin;
      const spawnArgv = bin.endsWith(".js") ? [bin, ...argv] : argv;
      const r = (0, node_child_process_1.spawnSync)(spawnBin, spawnArgv, {
        cwd: opts.repoRoot,
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024,
        ...timeoutMs > 0 ? { timeout: timeoutMs } : {}
      });
      const toolVersion = (0, discovery_1.readAstGrepVersion)(bin);
      if (r.error) {
        return {
          kind: "exec_failed",
          code: null,
          stderr: String(r.error.message)
        };
      }
      if (r.status != null && r.status > 2) {
        return {
          kind: "exec_failed",
          code: r.status,
          stderr: (r.stderr || r.stdout || "").trim()
        };
      }
      let rows;
      try {
        rows = parseSgJsonStdout(r.stdout || "");
      } catch (e) {
        return {
          kind: "parse_failed",
          message: e instanceof Error ? e.message : String(e)
        };
      }
      const matches = [];
      for (const row of rows) {
        const m = (0, normalize_1.mapRawMatch)(row, opts.repoRoot);
        if (m) {
          matches.push(m);
        }
      }
      const sorted = (0, normalize_1.stableSortMatches)(matches);
      const capped = (0, normalize_1.applyCaps)(sorted, opts.maxMatchesPerFile, opts.maxMatchesPerRule);
      const allWarnings = [...pathWarnings, ...capped.warnings];
      const files = new Set(capped.matches.map((x) => x.path));
      return {
        kind: "ok",
        matches: capped.matches,
        toolVersion,
        warnings: allWarnings,
        truncated: capped.truncated
      };
    }
  }
});

// ../../packages/tonic-core/dist/astGrep/command.js
var require_command = __commonJS({
  "../../packages/tonic-core/dist/astGrep/command.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveDefaultRulePath = resolveDefaultRulePath;
    exports2.parseAstGrepHydrateArgv = parseAstGrepHydrateArgv;
    exports2.runAstGrepHydrateFromArgv = runAstGrepHydrateFromArgv;
    exports2.runAstGrepHydrate = runAstGrepHydrate;
    var crypto = __importStar(require("node:crypto"));
    var path2 = __importStar(require("node:path"));
    var artifact_1 = require_artifact();
    var runner_1 = require_runner();
    var types_1 = require_types();
    function defaultRulesDir() {
      return path2.join(__dirname, "..", "..", "rules", "ast-grep");
    }
    function resolveDefaultRulePath() {
      return path2.join(defaultRulesDir(), "typescript.yml");
    }
    function getArg(argv, names, def) {
      for (const n of names) {
        const i = argv.indexOf(n);
        if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) {
          return argv[i + 1];
        }
      }
      return def;
    }
    function hasFlag(argv, names) {
      return names.some((n) => argv.includes(n));
    }
    function collectMulti(argv, flag) {
      const out = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === flag && argv[i + 1] && !argv[i + 1].startsWith("-")) {
          out.push(argv[i + 1]);
          i++;
        }
      }
      return out;
    }
    function parseAstGrepHydrateArgv(argv) {
      const repo = path2.resolve(getArg(argv, ["--repo", "-R"], "."));
      const outPath = getArg(argv, ["--out", "-o"], path2.join(repo, ".tonic", "ast-hydration.json"));
      const runOut = getArg(argv, ["--run-out"], path2.join(repo, ".tonic", "hydration-run.json"));
      let ruleset = getArg(argv, ["--ruleset"], "default");
      let configPath = getArg(argv, ["--config", "-c"], "");
      let rulePath = getArg(argv, ["--rule"], "");
      const inlineRule = getArg(argv, ["--inline-rule"], "");
      const languages3 = getArg(argv, ["--languages"], "auto");
      const includeGlobs = collectMulti(argv, "--include");
      const excludeGlobs = collectMulti(argv, "--exclude");
      const changedOnly = hasFlag(argv, ["--changed-only"]);
      const maxPerFile = parseInt(getArg(argv, ["--max-matches-per-file"], "0"), 10) || 0;
      const maxPerRule = parseInt(getArg(argv, ["--max-matches-per-rule"], "0"), 10) || 0;
      const astGrepBin = getArg(argv, ["--ast-grep-bin"], "");
      const extraArgs = [];
      const ei = argv.indexOf("--");
      if (ei >= 0) {
        extraArgs.push(...argv.slice(ei + 1));
      }
      if (ruleset === "default" && !configPath && !rulePath && !inlineRule) {
        rulePath = resolveDefaultRulePath();
        ruleset = "default";
      }
      return {
        ok: true,
        opts: {
          repoRoot: repo,
          outPath,
          runOutPath: runOut,
          ruleset,
          configPath,
          rulePath,
          inlineRule,
          languages: languages3,
          includeGlobs,
          excludeGlobs,
          changedOnly,
          maxMatchesPerFile: maxPerFile,
          maxMatchesPerRule: maxPerRule,
          astGrepBin,
          extraArgs
        }
      };
    }
    function runAstGrepHydrateFromArgv(argv) {
      const parsed = parseAstGrepHydrateArgv(argv);
      if (!parsed.ok) {
        console.error(parsed.message);
        return types_1.EXIT_INVALID_ARGS;
      }
      return runAstGrepHydrate(parsed.opts);
    }
    function runAstGrepHydrate(opts) {
      const t0 = Date.now();
      const runId = crypto.randomUUID();
      const errors = [];
      const warnings = [];
      const result = (0, runner_1.runAstGrepScan)(opts);
      if (result.kind === "missing_binary") {
        errors.push({ code: "ast_grep_missing", message: result.message });
        (0, artifact_1.writeUtf8Json)(opts.runOutPath, (0, artifact_1.buildRunJson)({
          runId,
          status: "failed",
          exitCode: types_1.EXIT_AST_GREP_MISSING,
          errors,
          warnings,
          inputs: (0, artifact_1.summarizeAstInputs)(opts),
          timingMs: Date.now() - t0,
          astEvidencePath: null
        }));
        return types_1.EXIT_AST_GREP_MISSING;
      }
      if (result.kind === "invalid_args") {
        errors.push({ code: "invalid_args", message: result.message });
        (0, artifact_1.writeUtf8Json)(opts.runOutPath, (0, artifact_1.buildRunJson)({
          runId,
          status: "failed",
          exitCode: types_1.EXIT_INVALID_ARGS,
          errors,
          warnings,
          inputs: (0, artifact_1.summarizeAstInputs)(opts),
          timingMs: Date.now() - t0,
          astEvidencePath: null
        }));
        return types_1.EXIT_INVALID_ARGS;
      }
      if (result.kind === "exec_failed") {
        errors.push({
          code: "scan_failed",
          message: `ast-grep exited ${result.code ?? "?"}`,
          detail: result.stderr
        });
        (0, artifact_1.writeUtf8Json)(opts.runOutPath, (0, artifact_1.buildRunJson)({
          runId,
          status: "failed",
          exitCode: types_1.EXIT_SCAN_FAILED,
          errors,
          warnings,
          inputs: (0, artifact_1.summarizeAstInputs)(opts),
          timingMs: Date.now() - t0,
          astEvidencePath: null
        }));
        return types_1.EXIT_SCAN_FAILED;
      }
      if (result.kind === "parse_failed") {
        errors.push({ code: "parse_failed", message: result.message });
        (0, artifact_1.writeUtf8Json)(opts.runOutPath, (0, artifact_1.buildRunJson)({
          runId,
          status: "failed",
          exitCode: types_1.EXIT_SCAN_FAILED,
          errors,
          warnings,
          inputs: (0, artifact_1.summarizeAstInputs)(opts),
          timingMs: Date.now() - t0,
          astEvidencePath: null
        }));
        return types_1.EXIT_SCAN_FAILED;
      }
      warnings.push(...result.warnings);
      let status = "ok";
      let exitCode = types_1.EXIT_OK;
      if (result.truncated || warnings.length > 0) {
        status = "partial";
        exitCode = types_1.EXIT_PARTIAL;
      }
      const langs = opts.languages.trim().toLowerCase() === "auto" || !opts.languages.trim() ? ["auto"] : opts.languages.split(",").map((s) => s.trim()).filter(Boolean);
      const ast = (0, artifact_1.buildAstHydrationJson)({
        repoRoot: opts.repoRoot,
        ruleset: opts.ruleset,
        languages: langs,
        scanScope: opts.changedOnly ? "changed-only" : "full",
        toolVersion: result.toolVersion,
        matches: result.matches,
        truncated: result.truncated
      });
      (0, artifact_1.writeUtf8Json)(opts.outPath, ast);
      (0, artifact_1.writeUtf8Json)(opts.runOutPath, (0, artifact_1.buildRunJson)({
        runId,
        status,
        exitCode,
        errors,
        warnings,
        inputs: (0, artifact_1.summarizeAstInputs)(opts),
        timingMs: Date.now() - t0,
        astEvidencePath: path2.resolve(opts.outPath).replace(/\\/g, "/")
      }));
      return exitCode;
    }
  }
});

// ../../packages/tonic-core/dist/hydration/astRefinementExcerpt.js
var require_astRefinementExcerpt = __commonJS({
  "../../packages/tonic-core/dist/hydration/astRefinementExcerpt.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.formatAstMatchesExcerptJson = formatAstMatchesExcerptJson;
    var DEFAULT_MAX_MATCHES = 40;
    var DEFAULT_MAX_MESSAGE_LEN = 240;
    function formatAstMatchesExcerptJson(ast, env3) {
      if (!ast || ast.matches.length === 0) {
        return "[]";
      }
      const maxMatches = Math.max(1, parseInt(env3.TONIC_AST_REFINEMENT_MAX_MATCHES ?? "", 10) || DEFAULT_MAX_MATCHES);
      const maxMsg = Math.max(32, parseInt(env3.TONIC_AST_REFINEMENT_MAX_MESSAGE_LEN ?? "", 10) || DEFAULT_MAX_MESSAGE_LEN);
      const slice = ast.matches.slice(0, maxMatches);
      const brief = slice.map((m) => ({
        path: m.path,
        rule_id: m.rule_id,
        message: (m.message || "").slice(0, maxMsg),
        line: m.start?.line
      }));
      return JSON.stringify(brief, null, 2);
    }
  }
});

// ../../packages/tonic-core/dist/hydration/buildIntentHydration.js
var require_buildIntentHydration = __commonJS({
  "../../packages/tonic-core/dist/hydration/buildIntentHydration.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildIntentHydration = buildIntentHydration;
    exports2.readJsonFile = readJsonFile;
    exports2.writeIntentHydration = writeIntentHydration;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    function pickIntents(boot, refine) {
      if (refine && refine.mode !== "off" && refine.refined_left_intent && refine.refined_right_intent) {
        return { left: refine.refined_left_intent, right: refine.refined_right_intent };
      }
      if (refine?.refined_left_intent && refine.refined_right_intent) {
        return { left: refine.refined_left_intent, right: refine.refined_right_intent };
      }
      return { left: boot.left_intent, right: boot.right_intent };
    }
    function astMatchesNearConflicts(ast, conflicts, maxPerFile) {
      if (!ast || ast.matches.length === 0 || conflicts.conflict_regions.length === 0) {
        return ast?.matches.slice(0, 50) ?? [];
      }
      const byFile = /* @__PURE__ */ new Map();
      for (const r of conflicts.conflict_regions) {
        const list = byFile.get(r.path) ?? [];
        list.push(r);
        byFile.set(r.path, list);
      }
      const scored = [];
      for (const m of ast.matches) {
        const regs = byFile.get(m.path);
        if (!regs) {
          continue;
        }
        const line = m.start?.line ?? 0;
        let best = Infinity;
        for (const reg of regs) {
          const d = Math.abs(line - reg.mid_line);
          if (d < best) {
            best = d;
          }
        }
        scored.push({ m, score: best });
      }
      scored.sort((a, b) => a.score !== b.score ? a.score - b.score : a.m.path !== b.m.path ? a.m.path.localeCompare(b.m.path) : (a.m.rule_id || "").localeCompare(b.m.rule_id || ""));
      const out = [];
      const perFile = /* @__PURE__ */ new Map();
      for (const { m } of scored) {
        const n = (perFile.get(m.path) ?? 0) + 1;
        if (n > maxPerFile) {
          continue;
        }
        perFile.set(m.path, n);
        out.push(m);
        if (out.length >= 80) {
          break;
        }
      }
      if (out.length === 0) {
        return ast.matches.slice(0, 50);
      }
      return out;
    }
    function buildIntentHydration(params) {
      const { left, right } = pickIntents(params.bootstrap, params.refinement);
      const links = [];
      const regionIds = [];
      if (params.conflicts) {
        for (const r of params.conflicts.conflict_regions) {
          if (r.region_id) {
            regionIds.push(r.region_id);
          }
          links.push({
            id: r.region_id,
            type: "conflict",
            path: r.path,
            line_start: r.start_line,
            line_end: r.end_line,
            detail: "git conflict marker region"
          });
        }
      }
      const emptyConflicts = {
        schema: "tonic-conflict-context",
        version: "1",
        scan_scope: "none",
        conflict_regions: []
      };
      const near = astMatchesNearConflicts(params.ast, params.conflicts ?? emptyConflicts, 5);
      let i = 0;
      for (const m of near) {
        i += 1;
        links.push({
          id: `ast-${i}`,
          type: "ast_match",
          path: m.path,
          line_start: m.start?.line,
          line_end: m.end?.line,
          detail: m.rule_id
        });
      }
      const maxRetrievalLinks = 25;
      if (params.retrieval?.hits?.length) {
        for (let j = 0; j < Math.min(params.retrieval.hits.length, maxRetrievalLinks); j++) {
          const h = params.retrieval.hits[j];
          const p = String(h.metadata?.path ?? "");
          const meta = h.metadata ?? {};
          const boost = meta.ast_boost_applied === true ? " ast_boost_applied=true" : "";
          const near2 = typeof meta.nearest_conflict_region_id === "string" ? meta.nearest_conflict_region_id : "";
          const nearPart = near2 ? ` nearest_conflict_region_id=${near2}` : "";
          links.push({
            id: `retrieval-${h.chunk_id}`,
            type: "retrieval_hit",
            path: p,
            line_start: typeof h.metadata?.start_line === "number" ? h.metadata.start_line : void 0,
            line_end: typeof h.metadata?.end_line === "number" ? h.metadata.end_line : void 0,
            detail: `score=${typeof h.score === "number" ? h.score.toFixed(4) : "?"}${boost}${nearPart}`
          });
        }
      }
      if (params.codeWalkTracePath) {
        links.push({
          id: "code-walk-trace",
          type: "code_walk",
          path: params.codeWalkTracePath.replace(/\\/g, "/"),
          detail: "tonic-code-walk-trace.v1"
        });
      }
      const excerpt = `Intents \u2014 left: ${left}
Intents \u2014 right: ${right}
` + (params.refinement?.subquestions?.length ? `Subquestions: ${params.refinement.subquestions.map((s) => s.text).join(" | ")}
` : "") + `Evidence links: ${links.length}`;
      links.sort((a, b) => {
        const ta = a.type.localeCompare(b.type);
        if (ta !== 0) {
          return ta;
        }
        const pa = a.path.localeCompare(b.path);
        if (pa !== 0) {
          return pa;
        }
        return String(a.id ?? "").localeCompare(String(b.id ?? ""));
      });
      return {
        schema: "tonic-intent-hydration",
        version: "1",
        left_intent: left,
        right_intent: right,
        truncation_policy_version: "1",
        token_budget_hint: 8e3,
        conflict_region_ids: regionIds.length ? regionIds : void 0,
        evidence_links: links,
        prompt_excerpt: excerpt
      };
    }
    function readJsonFile(p) {
      try {
        return JSON.parse(fs2.readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    }
    function writeIntentHydration(pathOut, art) {
      fs2.mkdirSync(path2.dirname(path2.resolve(pathOut)), { recursive: true });
      fs2.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
    }
  }
});

// ../../packages/tonic-core/dist/hydration/conflictHunkExcerpt.js
var require_conflictHunkExcerpt = __commonJS({
  "../../packages/tonic-core/dist/hydration/conflictHunkExcerpt.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.CONFLICT_HUNK_MAX_TOTAL_CHARS = exports2.CONFLICT_HUNK_MAX_LINES_PER_SIDE = void 0;
    exports2.buildConflictHunkExcerpts = buildConflictHunkExcerpts;
    exports2.conflictHunkExcerptsToPromptJson = conflictHunkExcerptsToPromptJson;
    exports2.mergeBranchHintsFromRegions = mergeBranchHintsFromRegions;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var gitConflictParser_1 = require_gitConflictParser();
    exports2.CONFLICT_HUNK_MAX_LINES_PER_SIDE = 40;
    exports2.CONFLICT_HUNK_MAX_TOTAL_CHARS = 32e3;
    function truncateLines(lines, maxLines) {
      if (lines.length <= maxLines) {
        return { text: lines.join("\n"), truncated: false };
      }
      const slice = lines.slice(0, maxLines);
      return {
        text: slice.join("\n") + "\n[\u2026 truncated \u2026]",
        truncated: true
      };
    }
    function buildConflictHunkExcerpts(repoRoot, conflictArt, env3) {
      const disabled = (env3.TONIC_CONFLICT_EXCERPT ?? "").trim() === "0";
      if (disabled || conflictArt.conflict_regions.length === 0) {
        return { schema: "tonic-conflict-hunk-excerpts", version: "1", regions: [] };
      }
      const maxLines = Math.max(1, parseInt(env3.TONIC_CONFLICT_EXCERPT_MAX_LINES_PER_SIDE ?? "", 10) || exports2.CONFLICT_HUNK_MAX_LINES_PER_SIDE);
      const maxTotal = Math.max(1024, parseInt(env3.TONIC_CONFLICT_EXCERPT_MAX_TOTAL_CHARS ?? "", 10) || exports2.CONFLICT_HUNK_MAX_TOTAL_CHARS);
      const regions = [];
      let totalChars = 0;
      for (const r of conflictArt.conflict_regions) {
        if (totalChars >= maxTotal) {
          break;
        }
        const abs = path2.join(repoRoot, r.path.replace(/\//g, path2.sep));
        let text;
        try {
          text = fs2.readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        const { blocks } = (0, gitConflictParser_1.parseGitConflictsWithDiagnostics)(text);
        const start0 = r.start_line - 1;
        const end0 = r.end_line - 1;
        let matched = false;
        for (const b of blocks) {
          if (b.startLine !== start0 || b.endLine !== end0) {
            continue;
          }
          matched = true;
          const oursLines = b.segments[0]?.lines ?? [];
          const theirsLines = b.segments[1]?.lines ?? [];
          const o = truncateLines(oursLines, maxLines);
          const t = truncateLines(theirsLines, maxLines);
          const row = {
            region_id: r.region_id,
            path: r.path,
            ours_excerpt: o.text,
            theirs_excerpt: t.text,
            truncated: o.truncated || t.truncated
          };
          const rowChars = row.ours_excerpt.length + row.theirs_excerpt.length + 64;
          if (totalChars + rowChars > maxTotal) {
            row.ours_excerpt = row.ours_excerpt.slice(0, Math.max(0, maxTotal - totalChars - 200)) + "\n[\u2026 truncated \u2026]";
            row.theirs_excerpt = "";
            row.truncated = true;
          }
          totalChars += row.ours_excerpt.length + row.theirs_excerpt.length + 64;
          regions.push(row);
          break;
        }
        if (!matched) {
          regions.push({
            region_id: r.region_id,
            path: r.path,
            ours_excerpt: "",
            theirs_excerpt: "",
            truncated: false
          });
        }
      }
      return { schema: "tonic-conflict-hunk-excerpts", version: "1", regions };
    }
    function conflictHunkExcerptsToPromptJson(art) {
      return JSON.stringify(art.regions, null, 2);
    }
    function mergeBranchHintsFromRegions(regions) {
      const labels = [];
      for (const r of regions) {
        if (r.ours_label) {
          labels.push(`ours=${r.ours_label}`);
        }
        if (r.theirs_label) {
          labels.push(`theirs=${r.theirs_label}`);
        }
      }
      if (labels.length === 0) {
        return "";
      }
      return [...new Set(labels)].join("; ");
    }
  }
});

// ../../packages/tonic-core/dist/hydration/conflictGate.js
var require_conflictGate = __commonJS({
  "../../packages/tonic-core/dist/hydration/conflictGate.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.evaluateConflictGate = evaluateConflictGate;
    var types_1 = require_types();
    function evaluateConflictGate(env3, conflictRegionCount) {
      if ((env3.TONIC_SKIP_CONFLICT_GATE ?? "").trim() === "1") {
        return {
          outcome: {
            policy: "skipped",
            conflict_region_count: conflictRegionCount,
            action: "continue",
            stop_reason: "TONIC_SKIP_CONFLICT_GATE=1"
          },
          shouldStop: false,
          exitCode: types_1.EXIT_OK
        };
      }
      const policy = (env3.TONIC_CONFLICT_GATE ?? "").trim().toLowerCase();
      if (policy === "zero_stop" && conflictRegionCount === 0) {
        return {
          outcome: {
            policy: "zero_stop",
            conflict_region_count: 0,
            action: "stop",
            stop_reason: "zero conflict regions under TONIC_CONFLICT_GATE=zero_stop"
          },
          shouldStop: true,
          exitCode: types_1.EXIT_PARTIAL
        };
      }
      return {
        outcome: {
          policy: policy || "default",
          conflict_region_count: conflictRegionCount,
          action: "continue"
        },
        shouldStop: false,
        exitCode: types_1.EXIT_OK
      };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/conflictScan.js
var require_conflictScan = __commonJS({
  "../../packages/tonic-core/dist/hydration/conflictScan.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.scanRepoConflictMarkers = scanRepoConflictMarkers;
    exports2.writeConflictContext = writeConflictContext;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var gitConflictParser_1 = require_gitConflictParser();
    function walkFiles(repoRoot) {
      const out = [];
      function walk(dir, base) {
        let entries;
        try {
          entries = fs2.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (e.name === ".git" || e.name === "node_modules" || e.name === ".tonic") {
            continue;
          }
          const rel = path2.join(base, e.name).replace(/\\/g, "/");
          const full = path2.join(dir, e.name);
          if (e.isDirectory()) {
            walk(full, rel);
          } else if (e.isFile()) {
            out.push(rel);
          }
        }
      }
      walk(repoRoot, "");
      return out.sort();
    }
    function scanRepoConflictMarkers(repoRoot) {
      const relPaths = walkFiles(repoRoot);
      const regions = [];
      let rid = 0;
      for (const rel of relPaths) {
        const abs = path2.join(repoRoot, rel);
        let text;
        try {
          text = fs2.readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        const { blocks } = (0, gitConflictParser_1.parseGitConflictsWithDiagnostics)(text);
        for (const b of blocks) {
          rid += 1;
          const startLine = b.startLine + 1;
          const endLine = b.endLine + 1;
          const midLine = Math.floor((startLine + endLine) / 2);
          const ours = b.segments[0]?.label ?? "";
          const theirs = b.segments[1]?.label ?? "";
          regions.push({
            path: rel.replace(/\\/g, "/"),
            region_id: `r${rid}`,
            start_line: startLine,
            mid_line: midLine,
            end_line: endLine,
            ours_label: ours || void 0,
            theirs_label: theirs || void 0
          });
        }
      }
      regions.sort((a, b) => a.path !== b.path ? a.path.localeCompare(b.path) : a.start_line - b.start_line);
      return {
        schema: "tonic-conflict-context",
        version: "1",
        scan_scope: "workspace",
        conflict_regions: regions
      };
    }
    function writeConflictContext(pathOut, art) {
      fs2.mkdirSync(path2.dirname(path2.resolve(pathOut)), { recursive: true });
      fs2.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
    }
  }
});

// ../../packages/tonic-core/dist/hydration/hydrationPhase.js
var require_hydrationPhase = __commonJS({
  "../../packages/tonic-core/dist/hydration/hydrationPhase.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HYDRATE_PHASE_LEVEL = exports2.HYDRATE_PHASE_ALL = void 0;
    exports2.parseHydratePhase = parseHydratePhase;
    exports2.HYDRATE_PHASE_ALL = 100;
    exports2.HYDRATE_PHASE_LEVEL = {
      conflicts: 0,
      intent_bootstrap: 1,
      repo_structure: 2,
      ast_grep: 3,
      question_refinement: 4,
      retrieval: 5,
      code_walk: 6
    };
    var ALIASES = {
      all: exports2.HYDRATE_PHASE_ALL,
      conflicts: 0,
      "intent-bootstrap": 1,
      bootstrap: 1,
      "repo-structure": 2,
      structure: 2,
      "question-refinement": 4,
      refinement: 4,
      ast: 3,
      "ast-grep": 3,
      ast_grep: 3,
      retrieval: 5,
      "code-walk": 6,
      code_walk: 6,
      codewalk: 6,
      /** Same as `all`: run optional retrieval/code-walk per flags, then intent bundle. */
      "intent-bundle": exports2.HYDRATE_PHASE_ALL,
      intent_bundle: exports2.HYDRATE_PHASE_ALL
    };
    function parseHydratePhase(raw) {
      const s = (raw ?? "").trim();
      if (!s) {
        return { ok: true, max: exports2.HYDRATE_PHASE_ALL };
      }
      const k = s.toLowerCase();
      if (ALIASES[k] === void 0) {
        return {
          ok: false,
          message: 'merge-tonic hydrate: unknown --phase "' + raw + '". Expected: all | conflicts | intent-bootstrap | structure | question-refinement | ast | retrieval | code-walk | intent-bundle'
        };
      }
      return { ok: true, max: ALIASES[k] };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/hydrationConfig.js
var require_hydrationConfig = __commonJS({
  "../../packages/tonic-core/dist/hydration/hydrationConfig.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.loadHydrationConfigFile = loadHydrationConfigFile;
    exports2.mergeHydrationConfig = mergeHydrationConfig;
    exports2.resolveHydrationConfig = resolveHydrationConfig;
    var fs2 = __importStar(require("node:fs"));
    var defaults = {
      questionMode: "off",
      refinementContext: "minimal",
      strictLlm: false,
      llmModel: "gpt-4o-mini",
      llmBaseUrl: "https://api.openai.com/v1",
      openaiApiKeyEnv: "OPENAI_API_KEY",
      llmJsonObject: true
    };
    function loadHydrationConfigFile(filePath) {
      if (!filePath?.trim()) {
        return {};
      }
      const raw = fs2.readFileSync(filePath, "utf8");
      const ext = filePath.toLowerCase();
      if (ext.endsWith(".json")) {
        return JSON.parse(raw);
      }
      const out = {};
      for (const line of raw.split(/\r?\n/)) {
        const m = /^(\w+):\s*(.*)$/.exec(line.trim());
        if (!m) {
          continue;
        }
        const k = m[1];
        const v = m[2].replace(/^["']|["']$/g, "").trim();
        if (k === "question_mode" && (v === "off" || v === "improver" || v === "subquestions")) {
          out.question_mode = v;
        }
        if (k === "question_refinement_context" && (v === "minimal" || v === "progressive")) {
          out.question_refinement_context = v;
        }
        if (k === "strict_llm") {
          out.strict_llm = v === "true" || v === "1" || v === "yes";
        }
        if (k === "llm_model") {
          out.llm_model = v;
        }
        if (k === "llm_base_url") {
          out.llm_base_url = v;
        }
        if (k === "openai_api_key_env") {
          out.openai_api_key_env = v;
        }
        if (k === "llm_json_object") {
          const b = parseYamlBool(v);
          if (b !== void 0) {
            out.llm_json_object = b;
          }
        }
      }
      return out;
    }
    function parseYamlBool(v) {
      if (v === "true" || v === "1" || v === "yes") {
        return true;
      }
      if (v === "false" || v === "0" || v === "no") {
        return false;
      }
      return void 0;
    }
    function mergeHydrationConfig(base, file, env3, cli) {
      const envMode = env3.TONIC_QUESTION_MODE?.trim();
      let questionMode = cli.questionMode ?? base.questionMode;
      if (file.question_mode) {
        questionMode = file.question_mode;
      }
      if (envMode === "off" || envMode === "improver" || envMode === "subquestions") {
        questionMode = envMode;
      }
      if (cli.questionMode) {
        questionMode = cli.questionMode;
      }
      const envJson = env3.TONIC_LLM_JSON_OBJECT?.trim().toLowerCase();
      let llmJsonObject = cli.llmJsonObject ?? base.llmJsonObject;
      if (typeof file.llm_json_object === "boolean") {
        llmJsonObject = file.llm_json_object;
      }
      if (envJson === "0" || envJson === "false" || envJson === "no" || envJson === "off") {
        llmJsonObject = false;
      }
      if (envJson === "1" || envJson === "true" || envJson === "yes" || envJson === "on") {
        llmJsonObject = true;
      }
      if (cli.llmJsonObject !== void 0) {
        llmJsonObject = cli.llmJsonObject;
      }
      return {
        questionMode,
        refinementContext: cli.refinementContext ?? (file.question_refinement_context === "progressive" ? "progressive" : base.refinementContext),
        strictLlm: cli.strictLlm ?? file.strict_llm ?? base.strictLlm,
        llmModel: cli.llmModel ?? file.llm_model ?? base.llmModel,
        llmBaseUrl: cli.llmBaseUrl ?? file.llm_base_url ?? base.llmBaseUrl,
        openaiApiKeyEnv: cli.openaiApiKeyEnv ?? file.openai_api_key_env ?? base.openaiApiKeyEnv,
        llmJsonObject
      };
    }
    function resolveHydrationConfig(configPath, env3, cliOverrides) {
      const file = loadHydrationConfigFile(configPath);
      return mergeHydrationConfig(defaults, file, env3, cliOverrides);
    }
  }
});

// ../../packages/tonic-core/dist/hydration/hydrationPromptTemplate.js
var require_hydrationPromptTemplate = __commonJS({
  "../../packages/tonic-core/dist/hydration/hydrationPromptTemplate.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.applyHydrationTemplate = applyHydrationTemplate;
    exports2.composeHydrationBodies = composeHydrationBodies;
    exports2.loadHydrationPromptBody = loadHydrationPromptBody;
    exports2.resetHydrationPromptCacheForTests = resetHydrationPromptCacheForTests;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
    function parseMdFrontmatter(text) {
      if (!text.startsWith("---")) {
        return { meta: {}, body: text.trim() };
      }
      const m = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(text);
      if (!m) {
        return { meta: {}, body: text.trim() };
      }
      const fmRaw = m[1];
      const body = m[2].trim();
      const meta = {};
      for (const line of fmRaw.split("\n")) {
        const idx = line.indexOf(":");
        if (idx === -1) {
          continue;
        }
        meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
      return { meta, body };
    }
    function applyHydrationTemplate(template, vars) {
      return template.replace(PLACEHOLDER, (_m, key) => Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{{${key}}}`);
    }
    function readEmbedMap() {
      const embedPath = path2.join(__dirname, "..", "..", "hydration-prompts", "embed.json");
      if (!fs2.existsSync(embedPath)) {
        return {};
      }
      try {
        const raw = fs2.readFileSync(embedPath, "utf8");
        const j = JSON.parse(raw);
        if (!j || typeof j !== "object") {
          return {};
        }
        const out = {};
        for (const [k, v] of Object.entries(j)) {
          if (typeof v === "string") {
            out[k] = v;
          }
        }
        return out;
      } catch {
        return {};
      }
    }
    var embedCache;
    function embedBodies() {
      if (!embedCache) {
        embedCache = readEmbedMap();
      }
      return embedCache;
    }
    function composeHydrationBodies(templateIds, joiner = "\n\n") {
      const parts = [];
      for (const id of templateIds) {
        const b = loadHydrationPromptBody(id);
        if (b?.trim()) {
          parts.push(b.trim());
        }
      }
      return parts.join(joiner);
    }
    function loadHydrationPromptBody(templateId) {
      const dir = process.env.TONIC_PROMPTS_DIR?.trim();
      if (dir) {
        const base = path2.resolve(dir);
        if (fs2.existsSync(base) && fs2.statSync(base).isDirectory()) {
          for (const f of fs2.readdirSync(base)) {
            if (!f.endsWith(".md")) {
              continue;
            }
            const fp = path2.join(base, f);
            const text = fs2.readFileSync(fp, "utf8");
            const { meta, body } = parseMdFrontmatter(text);
            const id = meta.id?.trim();
            if (id === templateId) {
              return body.trim();
            }
          }
        }
      }
      return embedBodies()[templateId];
    }
    function resetHydrationPromptCacheForTests() {
      embedCache = void 0;
    }
  }
});

// ../../packages/tonic-core/dist/hydration/intentBootstrap.js
var require_intentBootstrap = __commonJS({
  "../../packages/tonic-core/dist/hydration/intentBootstrap.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveIntentBootstrap = resolveIntentBootstrap;
    exports2.writeIntentBootstrap = writeIntentBootstrap;
    exports2.digestForRefinementContext = digestForRefinementContext;
    var crypto = __importStar(require("node:crypto"));
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var markerInterop_1 = require_markerInterop();
    var intentInteractive_1 = require_intentInteractive();
    var hydrationPromptTemplate_1 = require_hydrationPromptTemplate();
    function renderBootstrapExcerpt(left, right, repoRoot, userQuery, followUp) {
      const templateId = "hydration.intent_bootstrap";
      const tpl = (0, hydrationPromptTemplate_1.loadHydrationPromptBody)(templateId);
      if (tpl?.trim()) {
        const repoName = path2.basename(path2.resolve(repoRoot)) || ".";
        return (0, hydrationPromptTemplate_1.applyHydrationTemplate)(tpl, {
          left_intent: left,
          right_intent: right,
          repo_name: repoName,
          user_query: userQuery,
          follow_up: followUp
        });
      }
      return `Left intent: ${left}
Right intent: ${right}`;
    }
    function resolveIntentBootstrap(input) {
      const sources = {};
      let left = "";
      let right = "";
      const profilePath = input.intentProfilePath?.trim() || path2.join(input.repoRoot, intentInteractive_1.DEFAULT_INTENT_PROFILE_PATH);
      const prof = (0, intentInteractive_1.loadIntentProfile)(profilePath);
      if (prof?.leftIntent?.trim()) {
        left = prof.leftIntent.trim();
        sources.left = "profile_file";
      }
      if (prof?.rightIntent?.trim()) {
        right = prof.rightIntent.trim();
        sources.right = "profile_file";
      }
      if (input.env.TONIC_LEFT_INTENT?.trim()) {
        left = input.env.TONIC_LEFT_INTENT.trim();
        sources.left = "env";
      }
      if (input.env.TONIC_RIGHT_INTENT?.trim()) {
        right = input.env.TONIC_RIGHT_INTENT.trim();
        sources.right = "env";
      }
      const pair = (0, intentInteractive_1.parseIntentPair)(input.intentPair ?? "");
      if (pair) {
        left = pair.left;
        right = pair.right;
        sources.left = "intent_pair";
        sources.right = "intent_pair";
      }
      if (input.leftIntentFlag?.trim()) {
        left = input.leftIntentFlag.trim();
        sources.left = "cli_flag";
      }
      if (input.rightIntentFlag?.trim()) {
        right = input.rightIntentFlag.trim();
        sources.right = "cli_flag";
      }
      if (!left) {
        left = markerInterop_1.DEFAULT_GIT_MERGE_LEFT_INTENT;
        sources.left = "default";
      }
      if (!right) {
        right = markerInterop_1.DEFAULT_GIT_MERGE_RIGHT_INTENT;
        sources.right = "default";
      }
      const templateId = input.promptTemplateId ?? "hydration.intent_bootstrap";
      const uq = (input.userQuery ?? "").trim();
      const fu = (input.followUp ?? "").trim();
      return {
        schema: "tonic-hydration-intent-bootstrap",
        version: "1",
        left_intent: left,
        right_intent: right,
        sources,
        prompt_template_id: templateId,
        rendered_excerpt: renderBootstrapExcerpt(left, right, input.repoRoot, uq, fu)
      };
    }
    function writeIntentBootstrap(pathOut, art) {
      fs2.mkdirSync(path2.dirname(path2.resolve(pathOut)), { recursive: true });
      fs2.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
    }
    function digestForRefinementContext(parts) {
      const h = crypto.createHash("sha256");
      for (const p of parts) {
        h.update(p);
        h.update("\n");
      }
      return h.digest("hex");
    }
  }
});

// ../../packages/tonic-core/dist/hydration/repoStructure.js
var require_repoStructure = __commonJS({
  "../../packages/tonic-core/dist/hydration/repoStructure.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.summarizeRepoStructure = summarizeRepoStructure;
    exports2.writeRepoStructure = writeRepoStructure;
    exports2.repoStructureExcerpt = repoStructureExcerpt;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    function summarizeRepoStructure(repoRoot, maxDepth = 2) {
      const top = [];
      try {
        for (const e of fs2.readdirSync(repoRoot, { withFileTypes: true })) {
          if (e.name === ".git" || e.name === "node_modules" || e.name === ".tonic") {
            continue;
          }
          top.push(e.name);
        }
      } catch {
      }
      top.sort();
      return {
        schema: "tonic-repo-structure",
        version: "1",
        repo_root: repoRoot.replace(/\\/g, "/"),
        top_level: top,
        max_depth: maxDepth
      };
    }
    function writeRepoStructure(pathOut, art) {
      fs2.mkdirSync(path2.dirname(path2.resolve(pathOut)), { recursive: true });
      fs2.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
    }
    function repoStructureExcerpt(art) {
      return `Top-level: ${art.top_level.join(", ")}`;
    }
  }
});

// ../../packages/tonic-core/dist/hydration/llmRefinement.js
var require_llmRefinement = __commonJS({
  "../../packages/tonic-core/dist/hydration/llmRefinement.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.callOpenAiCompatibleJson = callOpenAiCompatibleJson;
    exports2.parseQuestionRefinementJson = parseQuestionRefinementJson;
    function stripJsonFence(s) {
      const t = s.trim();
      const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
      if (fence) {
        return fence[1].trim();
      }
      return t;
    }
    async function callOpenAiCompatibleJson(params, fetchFn = fetch) {
      const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), Math.max(1e3, params.timeoutMs));
      const useJsonObject = params.jsonObject !== false;
      try {
        const body = {
          model: params.model,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user }
          ],
          temperature: 0.2
        };
        if (useJsonObject) {
          body.response_format = { type: "json_object" };
        }
        const res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.apiKey}`
          },
          body: JSON.stringify(body),
          signal: ac.signal
        });
        if (!res.ok) {
          const errText = await res.text();
          return { ok: false, message: `HTTP ${res.status}: ${errText.slice(0, 500)}` };
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        if (!text) {
          return { ok: false, message: "empty completion" };
        }
        return { ok: true, text: stripJsonFence(text) };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, message: msg };
      } finally {
        clearTimeout(tid);
      }
    }
    function parseQuestionRefinementJson(raw, mode) {
      let j;
      try {
        j = JSON.parse(raw);
      } catch {
        return { ok: false, message: "invalid JSON from model" };
      }
      if (!j || typeof j !== "object") {
        return { ok: false, message: "model JSON must be object" };
      }
      const o = j;
      if (mode === "improver") {
        const left = typeof o.refined_left_intent === "string" ? o.refined_left_intent : "";
        const right = typeof o.refined_right_intent === "string" ? o.refined_right_intent : "";
        const mergeGoals = Array.isArray(o.merge_goals) ? o.merge_goals.filter((x) => typeof x === "string") : [];
        const assumptions = Array.isArray(o.assumptions) ? o.assumptions.filter((x) => typeof x === "string") : [];
        if (!left || !right) {
          return { ok: false, message: "improver JSON missing refined_left_intent/refined_right_intent" };
        }
        return {
          ok: true,
          value: {
            refined_left_intent: left,
            refined_right_intent: right,
            merge_goals: mergeGoals,
            assumptions
          }
        };
      }
      const sq = o.subquestions;
      if (!Array.isArray(sq)) {
        return { ok: false, message: "subquestions array required" };
      }
      const subquestions = sq.map((row) => {
        if (!row || typeof row !== "object") {
          return null;
        }
        const r = row;
        const id = typeof r.id === "string" ? r.id : "";
        const text = typeof r.text === "string" ? r.text : "";
        const priority = typeof r.priority === "number" ? r.priority : 0;
        if (!id || !text) {
          return null;
        }
        return { id, text, priority };
      }).filter((x) => x !== null).sort((a, b) => a.priority !== b.priority ? b.priority - a.priority : a.id.localeCompare(b.id));
      return { ok: true, value: { subquestions } };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/questionRefinement.js
var require_questionRefinement = __commonJS({
  "../../packages/tonic-core/dist/hydration/questionRefinement.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.runQuestionRefinement = runQuestionRefinement;
    exports2.runPostRetrievalQuestionRefinement = runPostRetrievalQuestionRefinement;
    exports2.writeQuestionRefinement = writeQuestionRefinement;
    exports2.writePostRetrievalRefinement = writePostRetrievalRefinement;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var intentBootstrap_1 = require_intentBootstrap();
    var hydrationPromptTemplate_1 = require_hydrationPromptTemplate();
    var llmRefinement_1 = require_llmRefinement();
    var IMPROVER_SYSTEM_FALLBACK = "You output only valid JSON with keys refined_left_intent, refined_right_intent, merge_goals (string array), assumptions (string array).";
    var SUBQ_SYSTEM_FALLBACK = "You output only valid JSON with key subquestions: array of {id, text, priority (number)}.";
    var POST_RETRIEVAL_SYSTEM_FALLBACK = "You output only valid JSON with keys refined_left_intent, refined_right_intent, merge_goals (string array), assumptions (string array), informed_by_retrieval (boolean optional).";
    function refinementDigestParts(params) {
      return [
        params.leftIntent,
        params.rightIntent,
        params.conflictRegionsJson,
        params.repoStructureExcerpt,
        params.userQuery,
        params.followUp,
        params.conflictHunksExcerptJson,
        params.astMatchesExcerptJson,
        params.retrievalHitsPreR1Json,
        params.retrievalHitsPass2Json,
        params.repoHeadShort,
        params.mergeBranchHints,
        params.priorRefinementPassLabel,
        params.priorPhasesDigestForCache
      ];
    }
    async function runQuestionRefinement(params) {
      const userQuery = (params.userQuery ?? "").trim();
      const followUp = (params.followUp ?? "").trim();
      const conflictHunksExcerptJson = (params.conflictHunksExcerptJson ?? "").trim() || "[]";
      const astMatchesExcerptJson = (params.astMatchesExcerptJson ?? "").trim() || "[]";
      const retrievalHitsPreR1Json = (params.retrievalHitsPreR1Json ?? "").trim() || "[]";
      const retrievalHitsPass2Json = (params.retrievalHitsPass2Json ?? "").trim() || "[]";
      const repoHeadShort = (params.repoHeadShort ?? "").trim();
      const mergeBranchHints = (params.mergeBranchHints ?? "").trim();
      const priorLabel = (params.priorRefinementPassLabel ?? "").trim() || "none";
      const priorForCache = (params.priorPhasesDigest ?? "").trim();
      const digest = (0, intentBootstrap_1.digestForRefinementContext)(refinementDigestParts({
        leftIntent: params.leftIntent,
        rightIntent: params.rightIntent,
        conflictRegionsJson: params.conflictRegionsJson,
        repoStructureExcerpt: params.repoStructureExcerpt,
        userQuery,
        followUp,
        conflictHunksExcerptJson,
        astMatchesExcerptJson,
        retrievalHitsPreR1Json,
        retrievalHitsPass2Json,
        repoHeadShort,
        mergeBranchHints,
        priorRefinementPassLabel: priorLabel,
        priorPhasesDigestForCache: priorForCache
      }));
      if (params.mode === "off") {
        return {
          kind: "artifact",
          skippedLlm: true,
          artifact: {
            schema: "tonic-question-refinement",
            version: "1",
            mode: "off",
            refined_left_intent: params.leftIntent,
            refined_right_intent: params.rightIntent,
            context_digest_sha256: digest
          }
        };
      }
      const keyName = params.config.openaiApiKeyEnv || "OPENAI_API_KEY";
      let apiKey = (params.env[keyName] ?? "").trim();
      const baseLower = params.config.llmBaseUrl.toLowerCase();
      const localhost = baseLower.includes("127.0.0.1") || baseLower.includes("localhost") || baseLower.includes("0.0.0.0");
      const allowDummy = params.env.TONIC_LLM_ALLOW_DUMMY_KEY?.trim() === "1";
      if (!apiKey && (localhost || allowDummy)) {
        apiKey = "dummy";
      }
      if (!apiKey) {
        if (params.config.strictLlm) {
          return { kind: "fail", message: `missing API key env ${keyName}`, code: 11 };
        }
        return {
          kind: "artifact",
          skippedLlm: true,
          warning: `skipped question refinement: missing ${keyName}`,
          artifact: {
            schema: "tonic-question-refinement",
            version: "1",
            mode: "off",
            refined_left_intent: params.leftIntent,
            refined_right_intent: params.rightIntent,
            context_digest_sha256: digest,
            prompt_template_ids: [`skipped:${params.mode}`]
          }
        };
      }
      const timeoutMs = parseInt(params.env.TONIC_LLM_TIMEOUT_MS ?? "120000", 10) || 12e4;
      const verboseDigest = params.env.TONIC_LLM_VERBOSE_DIGEST?.trim() === "1";
      const priorHex = verboseDigest ? (params.priorPhasesDigest ?? "").trim() : "";
      const templateId = params.mode === "improver" ? "hydration.question_improver" : "hydration.subquestion_generator";
      const systemId = params.mode === "improver" ? "hydration.question_improver_system" : "hydration.subquestion_generator_system";
      const systemBody = (0, hydrationPromptTemplate_1.loadHydrationPromptBody)(systemId);
      const system = params.mode === "improver" ? systemBody?.trim() ? systemBody.trim() : IMPROVER_SYSTEM_FALLBACK : systemBody?.trim() ? systemBody.trim() : SUBQ_SYSTEM_FALLBACK;
      const vars = {
        left_intent: params.leftIntent,
        right_intent: params.rightIntent,
        repo_structure_excerpt: params.repoStructureExcerpt,
        conflict_regions_json: params.conflictRegionsJson,
        prior_phases_digest: priorHex,
        prior_refinement_pass_label: priorLabel,
        user_query: userQuery,
        follow_up: followUp,
        conflict_hunks_excerpt_json: conflictHunksExcerptJson,
        ast_matches_excerpt_json: astMatchesExcerptJson,
        retrieval_hits_pre_r1_json: retrievalHitsPreR1Json,
        retrieval_hits_pass2_json: retrievalHitsPass2Json,
        repo_head_short: repoHeadShort,
        merge_branch_hints: mergeBranchHints
      };
      const fromTpl = (0, hydrationPromptTemplate_1.loadHydrationPromptBody)(templateId);
      const user = fromTpl?.trim() ? (0, hydrationPromptTemplate_1.applyHydrationTemplate)(fromTpl, vars) : params.mode === "improver" ? `Left intent: ${params.leftIntent}
Right intent: ${params.rightIntent}
Repo structure (excerpt):
${params.repoStructureExcerpt}
Conflict regions (JSON):
${params.conflictRegionsJson}
Return JSON only.` : `Left intent: ${params.leftIntent}
Right intent: ${params.rightIntent}
Repo structure (excerpt):
${params.repoStructureExcerpt}
Conflict regions (JSON):
${params.conflictRegionsJson}
Propose up to 8 subquestions as JSON.`;
      const llm = await (0, llmRefinement_1.callOpenAiCompatibleJson)({
        baseUrl: params.config.llmBaseUrl,
        model: params.config.llmModel,
        apiKey,
        system,
        user,
        timeoutMs,
        jsonObject: params.config.llmJsonObject
      }, params.fetchImpl);
      if (!llm.ok) {
        return { kind: "fail", message: llm.message, code: 11 };
      }
      const parsed = (0, llmRefinement_1.parseQuestionRefinementJson)(llm.text, params.mode);
      if (!parsed.ok) {
        return { kind: "fail", message: parsed.message, code: 11 };
      }
      const base = {
        schema: "tonic-question-refinement",
        version: "1",
        mode: params.mode,
        model_id: params.config.llmModel,
        prompt_template_ids: params.mode === "improver" ? ["hydration.question_improver"] : ["hydration.subquestion_generator"],
        context_digest_sha256: digest,
        ...parsed.value
      };
      return { kind: "artifact", skippedLlm: false, artifact: base };
    }
    async function runPostRetrievalQuestionRefinement(params) {
      const userQuery = (params.userQuery ?? "").trim();
      const followUp = (params.followUp ?? "").trim();
      const digest = (0, intentBootstrap_1.digestForRefinementContext)([
        params.leftIntent,
        params.rightIntent,
        params.conflictRegionsJson,
        params.repoStructureExcerpt,
        userQuery,
        followUp,
        params.retrievalHitsJson,
        "post_retrieval"
      ]);
      const keyName = params.config.openaiApiKeyEnv || "OPENAI_API_KEY";
      let apiKey = (params.env[keyName] ?? "").trim();
      const baseLower = params.config.llmBaseUrl.toLowerCase();
      const localhost = baseLower.includes("127.0.0.1") || baseLower.includes("localhost") || baseLower.includes("0.0.0.0");
      const allowDummy = params.env.TONIC_LLM_ALLOW_DUMMY_KEY?.trim() === "1";
      if (!apiKey && (localhost || allowDummy)) {
        apiKey = "dummy";
      }
      if (!apiKey) {
        if (params.config.strictLlm) {
          return { kind: "fail", message: `missing API key env ${keyName}`, code: 11 };
        }
        return {
          kind: "artifact",
          skippedLlm: true,
          warning: `skipped post-retrieval refinement: missing ${keyName}`,
          artifact: {
            schema: "tonic-question-refinement-post-retrieval",
            version: "1",
            mode: "improver",
            refined_left_intent: params.leftIntent,
            refined_right_intent: params.rightIntent,
            context_digest_sha256: digest,
            prompt_template_ids: ["skipped:post_retrieval"]
          }
        };
      }
      const timeoutMs = parseInt(params.env.TONIC_LLM_TIMEOUT_MS ?? "120000", 10) || 12e4;
      const systemBody = (0, hydrationPromptTemplate_1.loadHydrationPromptBody)("hydration.intent_improver_post_retrieval_system");
      const system = systemBody?.trim() ? systemBody.trim() : POST_RETRIEVAL_SYSTEM_FALLBACK;
      const tpl = (0, hydrationPromptTemplate_1.loadHydrationPromptBody)("hydration.intent_improver_post_retrieval");
      const vars = {
        left_intent: params.leftIntent,
        right_intent: params.rightIntent,
        repo_structure_excerpt: params.repoStructureExcerpt,
        conflict_regions_json: params.conflictRegionsJson,
        retrieval_hits_json: params.retrievalHitsJson,
        user_query: userQuery,
        follow_up: followUp
      };
      const user = tpl?.trim() ? (0, hydrationPromptTemplate_1.applyHydrationTemplate)(tpl, vars) : `Refine intents using retrieval hits.
Left: ${params.leftIntent}
Right: ${params.rightIntent}
Hits JSON:
${params.retrievalHitsJson}
Return JSON only.`;
      const llm = await (0, llmRefinement_1.callOpenAiCompatibleJson)({
        baseUrl: params.config.llmBaseUrl,
        model: params.config.llmModel,
        apiKey,
        system,
        user,
        timeoutMs,
        jsonObject: params.config.llmJsonObject
      }, params.fetchImpl);
      if (!llm.ok) {
        return { kind: "fail", message: llm.message, code: 11 };
      }
      const parsed = (0, llmRefinement_1.parseQuestionRefinementJson)(llm.text, "improver");
      if (!parsed.ok) {
        return { kind: "fail", message: parsed.message, code: 11 };
      }
      const base = {
        schema: "tonic-question-refinement-post-retrieval",
        version: "1",
        mode: "improver",
        model_id: params.config.llmModel,
        prompt_template_ids: ["hydration.intent_improver_post_retrieval"],
        context_digest_sha256: digest,
        ...parsed.value
      };
      return { kind: "artifact", skippedLlm: false, artifact: base };
    }
    function writeQuestionRefinement(pathOut, art) {
      fs2.mkdirSync(path2.dirname(path2.resolve(pathOut)), { recursive: true });
      fs2.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
    }
    function writePostRetrievalRefinement(pathOut, art) {
      fs2.mkdirSync(path2.dirname(path2.resolve(pathOut)), { recursive: true });
      fs2.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/chunker/astGrepChunker.js
var require_astGrepChunker = __commonJS({
  "../../packages/tonic-coding-hydration/dist/chunker/astGrepChunker.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.chunkFileAstGrep = chunkFileAstGrep;
    exports2.chunksFromAstArtifact = chunksFromAstArtifact;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    function lineRange(m) {
      const lo = m.start?.line ?? 1;
      const hi = Math.max(lo, m.end?.line ?? lo);
      return { lo, hi };
    }
    function mergeRanges(ranges, maxSpan) {
      if (ranges.length === 0) {
        return [];
      }
      const sorted = [...ranges].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
      const out = [];
      let cur = { ...sorted[0] };
      for (let i = 1; i < sorted.length; i++) {
        const r = sorted[i];
        if (r.lo <= cur.hi + 1) {
          cur.hi = Math.max(cur.hi, r.hi);
        } else {
          out.push(cur);
          cur = { ...r };
        }
      }
      out.push(cur);
      return out.map((r) => {
        const span = r.hi - r.lo + 1;
        if (span <= maxSpan) {
          return r;
        }
        return { lo: r.lo, hi: r.lo + maxSpan - 1 };
      });
    }
    function chunkFileAstGrep(repoRoot, relPath, matches) {
      const rel = relPath.replace(/\\/g, "/");
      const fileMatches = matches.filter((m) => m.path.replace(/\\/g, "/") === rel);
      if (fileMatches.length === 0) {
        return [];
      }
      const abs = path2.join(repoRoot, rel);
      let lines;
      try {
        const raw = fs2.readFileSync(abs, "utf8");
        lines = raw.split(/\r?\n/);
      } catch {
        return [];
      }
      const merged = mergeRanges(fileMatches.map((m) => lineRange(m)), 120);
      const out = [];
      let idx = 0;
      for (const rng of merged) {
        idx += 1;
        const start_line = rng.lo;
        const end_line = rng.hi;
        const slice = lines.slice(start_line - 1, end_line).join("\n");
        const first = fileMatches.find((m) => {
          const r = lineRange(m);
          return r.lo <= end_line && r.hi >= start_line;
        });
        const metaName = first?.meta && typeof first.meta.name === "string" ? first.meta.name : void 0;
        out.push({
          path: rel,
          start_line,
          end_line,
          text: slice,
          ast_rule_id: first?.rule_id,
          ast_match_id: `${rel}:${start_line}-${end_line}:${idx}`,
          symbol: metaName
        });
      }
      return out;
    }
    function chunksFromAstArtifact(repoRoot, matches) {
      const byPath = /* @__PURE__ */ new Map();
      for (const m of matches) {
        const p = m.path.replace(/\\/g, "/");
        const list = byPath.get(p) ?? [];
        list.push(m);
        byPath.set(p, list);
      }
      const chunks = [];
      for (const rel of [...byPath.keys()].sort()) {
        chunks.push(...chunkFileAstGrep(repoRoot, rel, byPath.get(rel)));
      }
      return chunks;
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/vector/memoryIndex.js
var require_memoryIndex = __commonJS({
  "../../packages/tonic-coding-hydration/dist/vector/memoryIndex.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.createMemoryVectorIndex = createMemoryVectorIndex;
    function createMemoryVectorIndex() {
      const store = /* @__PURE__ */ new Map();
      return {
        async upsert(records) {
          for (const r of records) {
            store.set(r.id, r);
          }
        },
        async query(queryEmbedding, topK) {
          const entries = [...store.values()];
          const scored = entries.map((r) => {
            if (r.embedding && r.embedding.length === queryEmbedding.length) {
              let s = 0;
              for (let i = 0; i < queryEmbedding.length; i++) {
                s += queryEmbedding[i] * r.embedding[i];
              }
              return { r, score: s };
            }
            return { r, score: 0 };
          });
          scored.sort((a, b) => b.score - a.score);
          const take = scored.slice(0, topK);
          return {
            ids: take.map((x) => x.r.id),
            documents: take.map((x) => x.r.document),
            metadatas: take.map((x) => x.r.metadata),
            distances: take.map((x) => 1 - x.score)
          };
        },
        async deleteIds(ids) {
          for (const id of ids) {
            store.delete(id);
          }
        }
      };
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/vector/chromaHttpIndex.js
var require_chromaHttpIndex = __commonJS({
  "../../packages/tonic-coding-hydration/dist/vector/chromaHttpIndex.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ChromaHttpIndexUnavailable = void 0;
    exports2.normalizeChromaBaseUrl = normalizeChromaBaseUrl;
    exports2.chromaConfigFromEnv = chromaConfigFromEnv;
    exports2.assertChromaConfigured = assertChromaConfigured;
    exports2.fetchChromaHeartbeat = fetchChromaHeartbeat;
    function normalizeChromaBaseUrl(baseUrl) {
      return baseUrl.replace(/\/$/, "");
    }
    function chromaConfigFromEnv(env3 = process.env) {
      const baseUrl = (env3.TONIC_CHROMA_URL ?? "").trim();
      const collection = (env3.TONIC_CHROMA_COLLECTION ?? "tonic-hydration").trim();
      if (!baseUrl) {
        return null;
      }
      return { baseUrl, collection };
    }
    var ChromaHttpIndexUnavailable = class extends Error {
      constructor(message = "Chroma HTTP index requires TONIC_CHROMA_URL and runtime chromadb client") {
        super(message);
        this.name = "ChromaHttpIndexUnavailable";
      }
    };
    exports2.ChromaHttpIndexUnavailable = ChromaHttpIndexUnavailable;
    async function assertChromaConfigured(env3) {
      const c = chromaConfigFromEnv(env3);
      if (!c) {
        throw new ChromaHttpIndexUnavailable();
      }
      return c;
    }
    async function fetchChromaHeartbeat(config, fetchImpl = globalThis.fetch) {
      const base = normalizeChromaBaseUrl(config.baseUrl);
      for (const path2 of ["/api/v1/heartbeat", "/api/v1/version"]) {
        try {
          const r = await fetchImpl(`${base}${path2}`, { method: "GET" });
          if (r.ok) {
            return true;
          }
        } catch {
        }
      }
      return false;
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/vector/chromaVectorIndex.js
var require_chromaVectorIndex = __commonJS({
  "../../packages/tonic-coding-hydration/dist/vector/chromaVectorIndex.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ChromaVectorIndex = void 0;
    var chromaHttpIndex_1 = require_chromaHttpIndex();
    function embeddingDimMismatchMessage(collection, stored, current) {
      return `Chroma collection ${JSON.stringify(collection)}: embedding dimension mismatch (stored ${stored}, current embedder ${current}). Set TONIC_CHROMA_COLLECTION to a new name or delete the collection.`;
    }
    function unwrapListPayload(raw) {
      if (!raw || typeof raw !== "object") {
        return [];
      }
      const o = raw;
      if (Array.isArray(o.data)) {
        return o.data;
      }
      if (Array.isArray(o.collections)) {
        return o.collections;
      }
      if (Array.isArray(o)) {
        return o;
      }
      return [];
    }
    var ChromaVectorIndex = class {
      config;
      collectionId = null;
      base;
      fetchImpl;
      constructor(config, fetchImpl = globalThis.fetch) {
        this.config = config;
        this.base = (0, chromaHttpIndex_1.normalizeChromaBaseUrl)(config.baseUrl);
        this.fetchImpl = fetchImpl;
      }
      async fetchCollectionDetail(collectionId) {
        const url = `${this.base}/api/v1/collections/${collectionId}`;
        const r = await this.fetchImpl(url, { method: "GET" });
        if (!r.ok) {
          return null;
        }
        const j = await r.json();
        return j && typeof j === "object" ? j : null;
      }
      assertVectorDim(label, vec, dim) {
        if (vec.length !== dim) {
          throw new Error(`ChromaVectorIndex.${label}: expected embedding length ${dim}, got ${vec.length}`);
        }
      }
      async resolveCollectionId() {
        if (this.collectionId) {
          return this.collectionId;
        }
        const embeddingDim = this.config.embeddingDim;
        const listUrl = `${this.base}/api/v1/collections`;
        const lr = await this.fetchImpl(listUrl, { method: "GET" });
        if (lr.ok) {
          const lj = await lr.json();
          const rows = unwrapListPayload(lj);
          const found = rows.find((r) => r.name === this.config.collection);
          if (found?.id) {
            if (embeddingDim !== void 0 && embeddingDim > 0) {
              const detail = await this.fetchCollectionDetail(found.id);
              const md = detail?.metadata;
              if (md && typeof md === "object") {
                const raw = md["tonic:embedding_dim"];
                if (raw !== void 0 && raw !== null) {
                  const prev = typeof raw === "number" ? raw : parseInt(String(raw), 10);
                  if (Number.isFinite(prev) && prev !== embeddingDim) {
                    throw new Error(embeddingDimMismatchMessage(this.config.collection, raw, embeddingDim));
                  }
                }
              }
            }
            this.collectionId = found.id;
            return found.id;
          }
        }
        const meta = { "hnsw:space": "cosine" };
        if (embeddingDim !== void 0 && embeddingDim > 0) {
          meta["tonic:embedding_dim"] = embeddingDim;
        }
        const cr = await this.fetchImpl(listUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: this.config.collection,
            metadata: meta
          })
        });
        if (!cr.ok) {
          const t = await cr.text();
          throw new Error(`Chroma create collection failed: ${cr.status} ${t.slice(0, 300)}`);
        }
        const cj = await cr.json();
        const id = cj.id;
        if (!id) {
          throw new Error("Chroma create collection: missing id");
        }
        this.collectionId = id;
        return id;
      }
      async upsert(records) {
        if (records.length === 0) {
          return;
        }
        const id = await this.resolveCollectionId();
        const dim = this.config.embeddingDim;
        const url = `${this.base}/api/v1/collections/${id}/add`;
        const embeddings = records.map((r) => {
          if (!r.embedding?.length) {
            throw new Error("ChromaVectorIndex.upsert requires embedding on each record");
          }
          if (dim !== void 0 && dim > 0) {
            this.assertVectorDim("upsert", r.embedding, dim);
          }
          return r.embedding;
        });
        const body = {
          ids: records.map((r) => r.id),
          embeddings,
          documents: records.map((r) => r.document),
          metadatas: records.map((r) => ({ ...r.metadata, source: "chroma" }))
        };
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Chroma add failed: ${res.status} ${t.slice(0, 400)}`);
        }
      }
      async query(queryEmbedding, topK) {
        const dim = this.config.embeddingDim;
        if (dim !== void 0 && dim > 0) {
          this.assertVectorDim("query", queryEmbedding, dim);
        }
        const id = await this.resolveCollectionId();
        const url = `${this.base}/api/v1/collections/${id}/query`;
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query_embeddings: [queryEmbedding],
            n_results: topK,
            include: ["documents", "metadatas", "distances"]
          })
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Chroma query failed: ${res.status} ${t.slice(0, 400)}`);
        }
        const j = await res.json();
        const ids0 = j.ids?.[0] ?? [];
        const docs0 = j.documents?.[0] ?? [];
        const meta0 = j.metadatas?.[0] ?? [];
        const dist0 = j.distances?.[0] ?? [];
        return {
          ids: ids0.map(String),
          documents: docs0.map((d) => d ?? ""),
          metadatas: meta0.map((m) => m && typeof m === "object" ? m : {}),
          distances: dist0
        };
      }
      async deleteIds(ids) {
        if (ids.length === 0) {
          return;
        }
        const id = await this.resolveCollectionId();
        const url = `${this.base}/api/v1/collections/${id}/delete`;
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids })
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Chroma delete failed: ${res.status} ${t.slice(0, 300)}`);
        }
      }
    };
    exports2.ChromaVectorIndex = ChromaVectorIndex;
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/embeddingProvider.js
var require_embeddingProvider = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/embeddingProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.OpenAiCompatibleEmbeddingProvider = exports2.HistogramEmbeddingProvider = void 0;
    var buildRetrieval_1 = require_buildRetrieval();
    var HistogramEmbeddingProvider = class {
      async embedBatch(texts) {
        return texts.map((t) => (0, buildRetrieval_1.textToEmbedding)(t));
      }
    };
    exports2.HistogramEmbeddingProvider = HistogramEmbeddingProvider;
    var OpenAiCompatibleEmbeddingProvider = class {
      baseUrl;
      model;
      apiKey;
      batchSize;
      fetchImpl;
      constructor(opts) {
        this.baseUrl = opts.baseUrl.replace(/\/$/, "");
        this.model = opts.model;
        this.apiKey = (opts.apiKey ?? "").trim();
        this.batchSize = Math.max(1, opts.batchSize ?? 32);
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
      }
      async embedBatch(texts) {
        const out = [];
        for (let i = 0; i < texts.length; i += this.batchSize) {
          const batch = texts.slice(i, i + this.batchSize);
          const url = `${this.baseUrl}/embeddings`;
          const headers = { "Content-Type": "application/json" };
          if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
          }
          const res = await this.fetchImpl(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ model: this.model, input: batch })
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`embeddings HTTP ${res.status}: ${errText.slice(0, 400)}`);
          }
          const data = await res.json();
          const rows = data.data ?? [];
          if (rows.length !== batch.length) {
            throw new Error(`embeddings: expected ${batch.length} vectors, got ${rows.length}`);
          }
          const dim = rows[0]?.embedding?.length ?? 0;
          for (const row of rows) {
            const emb = row.embedding;
            if (!emb || emb.length !== dim) {
              throw new Error("embeddings: inconsistent vector lengths in batch");
            }
            out.push(emb);
          }
        }
        return out;
      }
    };
    exports2.OpenAiCompatibleEmbeddingProvider = OpenAiCompatibleEmbeddingProvider;
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/embeddingFingerprint.js
var require_embeddingFingerprint = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/embeddingFingerprint.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.embeddingFingerprintFromEnv = embeddingFingerprintFromEnv;
    var HISTOGRAM_DIM = 48;
    function normBackend(raw) {
      const v = (raw ?? "auto").trim().toLowerCase();
      if (v === "hf_inference" || v === "hf-inference") {
        return "hf_inference";
      }
      if (v === "histogram" || v === "openai_compatible" || v === "openai-compatible") {
        return v === "openai-compatible" ? "openai_compatible" : v;
      }
      return "auto";
    }
    function embeddingBatchSize(env3) {
      const n = parseInt(env3.TONIC_EMBEDDING_BATCH_SIZE ?? "32", 10);
      return Number.isFinite(n) && n > 0 ? n : 32;
    }
    function embeddingFingerprintFromEnv(env3) {
      const backend = normBackend(env3.TONIC_EMBEDDING_BACKEND);
      if (backend === "hf_inference") {
        const model2 = (env3.TONIC_HF_EMBED_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2").trim() || "sentence-transformers/all-MiniLM-L6-v2";
        const urlOverride = (env3.TONIC_HF_EMBED_INFERENCE_URL ?? "").trim();
        const provider = (env3.TONIC_HF_INFERENCE_PROVIDER ?? "").trim();
        const bs2 = embeddingBatchSize(env3);
        return `hf_inference:${model2}:bs=${bs2}:url=${urlOverride}:prov=${provider}`;
      }
      const baseUrl = (env3.TONIC_EMBEDDING_BASE_URL ?? env3.TONIC_LLAMACPP_URL ?? "").trim();
      const useHttp = backend === "openai_compatible" || backend === "auto" && Boolean(baseUrl);
      if (!useHttp) {
        return `histogram:dim=${HISTOGRAM_DIM}`;
      }
      if (!baseUrl) {
        return `histogram:dim=${HISTOGRAM_DIM}`;
      }
      const model = (env3.TONIC_EMBEDDING_MODEL ?? "text-embedding-3-small").trim() || "text-embedding-3-small";
      const bs = embeddingBatchSize(env3);
      return `openai_compatible:${baseUrl}:model=${model}:bs=${bs}`;
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/vector/memoryVectorSnapshot.js
var require_memoryVectorSnapshot = __commonJS({
  "../../packages/tonic-coding-hydration/dist/vector/memoryVectorSnapshot.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.contentDigestUtf8 = contentDigestUtf8;
    exports2.parseMemoryVectorIndexArtifact = parseMemoryVectorIndexArtifact;
    exports2.loadMemoryVectorIndexFromPath = loadMemoryVectorIndexFromPath;
    exports2.saveMemoryVectorIndexToPath = saveMemoryVectorIndexToPath;
    exports2.resolveVectorCacheOptions = resolveVectorCacheOptions;
    exports2.buildVectorRecordsWithCache = buildVectorRecordsWithCache;
    var crypto = __importStar(require("node:crypto"));
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var astGrepChunker_1 = require_astGrepChunker();
    var embeddingFingerprint_1 = require_embeddingFingerprint();
    function contentDigestUtf8(document) {
      return crypto.createHash("sha256").update(document, "utf8").digest("hex");
    }
    function isRecord(x) {
      return typeof x === "object" && x !== null && !Array.isArray(x);
    }
    function parseMemoryVectorIndexArtifact(raw) {
      if (!isRecord(raw)) {
        return null;
      }
      if (raw.schema !== "tonic-memory-vector-index" || raw.version !== "1") {
        return null;
      }
      const fp = raw.embedding_fingerprint;
      if (typeof fp !== "string" || !fp.trim()) {
        return null;
      }
      const recs = raw.records;
      if (!Array.isArray(recs)) {
        return null;
      }
      const records = [];
      for (const r of recs) {
        if (!isRecord(r)) {
          continue;
        }
        const id = r.id;
        const document = r.document;
        const embedding = r.embedding;
        const metadata = r.metadata;
        const content_digest = r.content_digest;
        if (typeof id !== "string" || typeof document !== "string" || typeof content_digest !== "string") {
          continue;
        }
        if (!Array.isArray(embedding) || !embedding.every((x) => typeof x === "number" && Number.isFinite(x))) {
          continue;
        }
        records.push({
          id,
          document,
          embedding: embedding.map((x) => Number(x)),
          metadata: isRecord(metadata) ? { ...metadata } : {},
          content_digest
        });
      }
      const out = {
        schema: "tonic-memory-vector-index",
        version: "1",
        embedding_fingerprint: fp.trim(),
        records
      };
      if (typeof raw.embedding_dim === "number" && Number.isFinite(raw.embedding_dim) && raw.embedding_dim > 0) {
        out.embedding_dim = Math.floor(raw.embedding_dim);
      }
      if (raw.digest_algorithm === "sha256") {
        out.digest_algorithm = "sha256";
      }
      if (typeof raw.ruleset_hash === "string") {
        out.ruleset_hash = raw.ruleset_hash;
      }
      if (typeof raw.repo_head === "string") {
        out.repo_head = raw.repo_head;
      }
      return out;
    }
    function loadMemoryVectorIndexFromPath(filePath) {
      const p = path2.resolve(filePath);
      if (!fs2.existsSync(p)) {
        return null;
      }
      try {
        const raw = JSON.parse(fs2.readFileSync(p, "utf8"));
        return parseMemoryVectorIndexArtifact(raw);
      } catch {
        return null;
      }
    }
    function saveMemoryVectorIndexToPath(filePath, artifact) {
      const p = path2.resolve(filePath);
      const dir = path2.dirname(p);
      if (!fs2.existsSync(dir)) {
        fs2.mkdirSync(dir, { recursive: true });
      }
      const body = {
        ...artifact,
        digest_algorithm: artifact.digest_algorithm ?? "sha256"
      };
      fs2.writeFileSync(p, `${JSON.stringify(body)}
`, "utf8");
    }
    function resolveVectorCacheOptions(params) {
      const env3 = params.env ?? (typeof process !== "undefined" ? process.env : {});
      const p = (params.vectorCachePath ?? env3.TONIC_VECTOR_CACHE_PATH ?? "").trim();
      const raw = (params.vectorCacheMode ?? env3.TONIC_VECTOR_CACHE_MODE ?? "").trim().toLowerCase();
      if (!p) {
        return { path: "", mode: "off" };
      }
      if (raw === "off") {
        return { path: p, mode: "off" };
      }
      if (raw === "read") {
        return { path: p, mode: "read" };
      }
      if (raw === "write") {
        return { path: p, mode: "write" };
      }
      if (raw === "readwrite" || raw === "read-write") {
        return { path: p, mode: "readwrite" };
      }
      return { path: p, mode: "readwrite" };
    }
    async function buildVectorRecordsWithCache(params) {
      const chunks = (0, astGrepChunker_1.chunksFromAstArtifact)(params.repoRoot, params.matches);
      if (chunks.length === 0) {
        return [];
      }
      const fp = (0, embeddingFingerprint_1.embeddingFingerprintFromEnv)(params.env);
      const probe = await params.embedder.embedBatch([" "]);
      const expectedDim = probe[0]?.length ?? 0;
      if (expectedDim <= 0) {
        throw new Error("Vector cache: embedder returned empty dimension probe");
      }
      let snapshot = null;
      if (params.cacheMode === "read" || params.cacheMode === "readwrite") {
        snapshot = loadMemoryVectorIndexFromPath(params.cachePath);
        if (!snapshot && (params.cacheMode === "read" || params.cacheMode === "readwrite")) {
          params.warningsOut?.push({
            code: "vector_cache_missing",
            message: `No valid snapshot at ${params.cachePath}; embedded all chunks.`
          });
        } else if (snapshot && snapshot.embedding_fingerprint !== fp) {
          params.warningsOut?.push({
            code: "vector_cache_fingerprint_mismatch",
            message: "Snapshot embedding_fingerprint does not match current embedder; re-embedded all chunks."
          });
          snapshot = null;
        } else if (snapshot?.embedding_dim !== void 0 && snapshot.embedding_dim > 0 && snapshot.embedding_dim !== expectedDim) {
          params.warningsOut?.push({
            code: "vector_cache_dim_mismatch",
            message: `Snapshot embedding_dim ${snapshot.embedding_dim} != current ${expectedDim}; re-embedded all chunks.`
          });
          snapshot = null;
        }
      }
      const byId = /* @__PURE__ */ new Map();
      if (snapshot) {
        for (const r of snapshot.records) {
          byId.set(r.id, r);
        }
      }
      const docTexts = chunks.map((c) => `${c.path}
${c.text}`);
      const needIndex = [];
      const embeddings = new Array(chunks.length);
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const id = c.ast_match_id ?? `chunk-${i}`;
        const doc = docTexts[i];
        const digest = contentDigestUtf8(doc);
        const prev = byId.get(id);
        if (prev && prev.content_digest === digest && Array.isArray(prev.embedding) && prev.embedding.length === expectedDim) {
          embeddings[i] = prev.embedding;
        } else {
          needIndex.push(i);
        }
      }
      if (params.cacheMode === "write") {
        needIndex.length = 0;
        for (let i = 0; i < chunks.length; i++) {
          needIndex.push(i);
        }
        embeddings.fill(void 0);
      }
      if (needIndex.length > 0) {
        const toEmbed = needIndex.map((i) => docTexts[i]);
        const fresh = await params.embedder.embedBatch(toEmbed);
        for (let j = 0; j < needIndex.length; j++) {
          embeddings[needIndex[j]] = fresh[j];
        }
      }
      const records = chunks.map((c, i) => {
        const id = c.ast_match_id ?? `chunk-${i}`;
        const emb = embeddings[i];
        return {
          id,
          document: docTexts[i],
          embedding: emb,
          metadata: {
            path: c.path,
            start_line: c.start_line,
            end_line: c.end_line,
            source: "memory",
            ast_rule_id: c.ast_rule_id,
            ast_match_id: c.ast_match_id
          }
        };
      });
      const dim = records[0]?.embedding?.length ?? 0;
      if (dim > 0) {
        for (const r of records) {
          if (!r.embedding || r.embedding.length !== dim) {
            throw new Error("Embedding dimension mismatch after cache merge");
          }
        }
      }
      if (params.cacheMode === "write" || params.cacheMode === "readwrite") {
        try {
          const snap = {
            schema: "tonic-memory-vector-index",
            version: "1",
            embedding_fingerprint: fp,
            embedding_dim: dim > 0 ? dim : void 0,
            digest_algorithm: "sha256",
            ruleset_hash: params.diagnostics?.ruleset_hash,
            repo_head: params.diagnostics?.repo_head,
            records: records.map((r) => ({
              id: r.id,
              document: r.document,
              embedding: r.embedding,
              metadata: { ...r.metadata },
              content_digest: contentDigestUtf8(r.document)
            }))
          };
          saveMemoryVectorIndexToPath(params.cachePath, snap);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          params.warningsOut?.push({
            code: "vector_cache_write_failed",
            message: `Failed to write vector snapshot: ${msg.slice(0, 400)}`
          });
        }
      }
      return records;
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/attachAstMetadata.js
var require_attachAstMetadata = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/attachAstMetadata.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildAstLineMapFromMatches = buildAstLineMapFromMatches;
    exports2.buildConflictMidLineMap = buildConflictMidLineMap;
    exports2.attachAstMetadata = attachAstMetadata;
    function buildAstLineMapFromMatches(matches) {
      const m = /* @__PURE__ */ new Map();
      for (const x of matches) {
        const p = x.path.replace(/\\/g, "/");
        const lo = x.start?.line ?? 1;
        const hi = Math.max(lo, x.end?.line ?? lo);
        const set = m.get(p) ?? /* @__PURE__ */ new Set();
        for (let ln = lo; ln <= hi; ln++) {
          set.add(ln);
        }
        m.set(p, set);
      }
      return m;
    }
    function buildConflictMidLineMap(regions) {
      const map = /* @__PURE__ */ new Map();
      for (const r of regions) {
        const p = r.path.replace(/\\/g, "/");
        const mid = r.mid_line;
        if (typeof mid !== "number") {
          continue;
        }
        const arr = map.get(p) ?? [];
        arr.push(mid);
        map.set(p, arr);
      }
      return map;
    }
    function attachAstMetadata(hits, astPathsToLines, conflictMidLines, opts) {
      const alpha = opts?.alpha ?? 0.35;
      const proximityN = opts?.proximityLines ?? 5;
      const proxBoost = opts?.proximityBoost ?? 0.15;
      return hits.map((h) => {
        const pathNorm = String(h.metadata?.path ?? "").replace(/\\/g, "/");
        const start = Number(h.metadata?.start_line ?? 0);
        const end = Number(h.metadata?.end_line ?? start);
        const hitLo = Math.min(start, end) || 1;
        const hitHi = Math.max(start, end) || hitLo;
        const span = hitHi - hitLo + 1;
        const lines = astPathsToLines.get(pathNorm);
        let overlap = 0;
        if (lines && lines.size > 0) {
          for (let ln = hitLo; ln <= hitHi; ln++) {
            if (lines.has(ln)) {
              overlap++;
            }
          }
        }
        const overlapRatio = span > 0 ? overlap / span : 0;
        let boost = 1 + alpha * overlapRatio;
        let nearest;
        if (conflictMidLines?.size) {
          const mids = conflictMidLines.get(pathNorm) ?? [];
          let bestD = Infinity;
          for (const mid of mids) {
            for (let ln = hitLo; ln <= hitHi; ln++) {
              const d = Math.abs(ln - mid);
              if (d < bestD) {
                bestD = d;
              }
            }
          }
          if (bestD <= proximityN) {
            boost *= 1 + proxBoost * (1 - bestD / (proximityN + 1));
            nearest = `mid_distance_${bestD}`;
          }
        }
        const baseScore = h.score;
        const prevSource = h.metadata?.source;
        return {
          ...h,
          score: baseScore * boost,
          metadata: {
            ...h.metadata,
            source: typeof prevSource === "string" ? prevSource : "memory",
            ast_boost_applied: boost - 1,
            nearest_conflict_region_id: nearest
          }
        };
      });
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/buildRetrieval.js
var require_buildRetrieval = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/buildRetrieval.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildRetrievalArtifact = buildRetrievalArtifact;
    exports2.textToEmbedding = textToEmbedding;
    exports2.runMemoryRetrievalForHydrate = runMemoryRetrievalForHydrate;
    var astGrepChunker_1 = require_astGrepChunker();
    var embeddingProvider_1 = require_embeddingProvider();
    var memoryIndex_1 = require_memoryIndex();
    var memoryVectorSnapshot_1 = require_memoryVectorSnapshot();
    var attachAstMetadata_1 = require_attachAstMetadata();
    function buildRetrievalArtifact(params) {
      const hits = [];
      const qs = params.subquestions?.length ? params.subquestions.map((s) => s.text) : params.fallbackQuery ? [params.fallbackQuery] : [];
      qs.forEach((text, i) => {
        hits.push({
          chunk_id: `q-${i}`,
          text,
          score: 1,
          metadata: { source: "memory" }
        });
      });
      return { schema: "tonic-retrieval-hydration", version: "1", hits };
    }
    function textToEmbedding(text, dim = 48) {
      const v = new Array(dim).fill(0);
      const lower = text.toLowerCase().replace(/\s+/g, " ").trim();
      for (let i = 0; i < lower.length; i++) {
        const c = lower.charCodeAt(i);
        v[c % dim] += 1;
      }
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    }
    async function runMemoryRetrievalForHydrate(params) {
      const chunks = (0, astGrepChunker_1.chunksFromAstArtifact)(params.repoRoot, params.matches);
      if (chunks.length === 0 || params.queries.length === 0) {
        return [];
      }
      const embedder = params.embedder ?? new embeddingProvider_1.HistogramEmbeddingProvider();
      const env3 = params.env ?? (typeof process !== "undefined" ? process.env : {});
      const { path: cachePath, mode: cacheMode } = (0, memoryVectorSnapshot_1.resolveVectorCacheOptions)({
        vectorCachePath: params.vectorCachePath,
        vectorCacheMode: params.vectorCacheMode,
        env: env3
      });
      const index = (0, memoryIndex_1.createMemoryVectorIndex)();
      let records;
      if (cachePath && cacheMode !== "off") {
        records = await (0, memoryVectorSnapshot_1.buildVectorRecordsWithCache)({
          repoRoot: params.repoRoot,
          matches: params.matches,
          embedder,
          env: env3,
          cachePath,
          cacheMode,
          diagnostics: params.vectorCacheDiagnostics,
          warningsOut: params.vectorCacheWarningsOut
        });
      } else {
        const docTexts = chunks.map((c) => `${c.path}
${c.text}`);
        const docEmbeddings = await embedder.embedBatch(docTexts);
        records = chunks.map((c, i) => ({
          id: c.ast_match_id ?? `chunk-${i}`,
          document: `${c.path}
${c.text}`,
          embedding: docEmbeddings[i],
          metadata: {
            path: c.path,
            start_line: c.start_line,
            end_line: c.end_line,
            source: "memory",
            ast_rule_id: c.ast_rule_id,
            ast_match_id: c.ast_match_id
          }
        }));
      }
      await index.upsert(records);
      const astLineMap = (0, attachAstMetadata_1.buildAstLineMapFromMatches)(params.matches);
      const conflictMap = params.conflictRegions && params.conflictRegions.length > 0 ? (0, attachAstMetadata_1.buildConflictMidLineMap)(params.conflictRegions) : void 0;
      const queryEmbeddings = await embedder.embedBatch(params.queries);
      const collected = [];
      for (let qi = 0; qi < params.queries.length; qi++) {
        const qEmb = queryEmbeddings[qi];
        const res = await index.query(qEmb, params.topKPerQuery);
        for (let i = 0; i < res.ids.length; i++) {
          collected.push({
            chunk_id: res.ids[i],
            text: res.documents[i] ?? "",
            score: 1 - (res.distances?.[i] ?? 0),
            metadata: { ...res.metadatas[i] ?? {} }
          });
        }
      }
      const best = /* @__PURE__ */ new Map();
      for (const h of collected) {
        const prev = best.get(h.chunk_id);
        if (!prev || h.score > prev.score) {
          best.set(h.chunk_id, h);
        }
      }
      const merged = [...best.values()].sort((a, b) => b.score - a.score);
      const cap = params.topKPerQuery * Math.max(1, params.queries.length);
      return (0, attachAstMetadata_1.attachAstMetadata)(merged.slice(0, cap), astLineMap, conflictMap);
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/hfInferenceEmbeddingProvider.js
var require_hfInferenceEmbeddingProvider = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/hfInferenceEmbeddingProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HfInferenceEmbeddingProvider = void 0;
    exports2.hfEmbedInferenceRequestUrl = hfEmbedInferenceRequestUrl;
    function hfEmbedInferenceRequestUrl(model, env3) {
      const raw = (env3.TONIC_HF_EMBED_INFERENCE_URL ?? "").trim();
      if (raw) {
        if (raw.includes("{model}")) {
          return raw.split("{model}").join(encodeURIComponent(model));
        }
        return raw;
      }
      return `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;
    }
    function normalizeFeatureExtractionPayload(raw) {
      if (Array.isArray(raw) && raw.length > 0) {
        const first = raw[0];
        if (typeof first === "number") {
          return raw.map((x) => Number(x));
        }
        if (Array.isArray(first) && first.length > 0 && typeof first[0] === "number") {
          return first.map((x) => Number(x));
        }
      }
      throw new Error("hf_inference: unexpected feature_extraction shape");
    }
    var HfInferenceEmbeddingProvider = class {
      model;
      batchSize;
      fetchImpl;
      inferenceUrlTemplate;
      inferenceProvider;
      env;
      resolveToken;
      timeoutMs;
      constructor(opts) {
        this.model = opts.model.trim();
        this.batchSize = Math.max(1, opts.batchSize ?? 32);
        this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
        this.inferenceUrlTemplate = opts.inferenceUrlTemplate?.trim() || void 0;
        this.inferenceProvider = (opts.inferenceProvider ?? "").trim();
        this.env = opts.env ?? (typeof process !== "undefined" ? process.env : {});
        this.resolveToken = opts.resolveToken ?? (() => typeof process !== "undefined" ? String(process.env.HF_TOKEN ?? "").trim() : "");
        this.timeoutMs = opts.timeoutMs ?? 12e4;
      }
      requestUrl() {
        const base = this.inferenceUrlTemplate ? this.inferenceUrlTemplate.includes("{model}") ? this.inferenceUrlTemplate.split("{model}").join(encodeURIComponent(this.model)) : this.inferenceUrlTemplate : hfEmbedInferenceRequestUrl(this.model, this.env);
        if (!this.inferenceProvider) {
          return base;
        }
        try {
          const u = new URL(base);
          u.searchParams.set("provider", this.inferenceProvider);
          return u.href;
        } catch {
          const sep = base.includes("?") ? "&" : "?";
          return `${base}${sep}provider=${encodeURIComponent(this.inferenceProvider)}`;
        }
      }
      async embedBatch(texts) {
        const token = this.resolveToken();
        if (!token) {
          throw new Error("HF_TOKEN is required for TONIC_EMBEDDING_BACKEND=hf_inference");
        }
        const url = this.requestUrl();
        const out = [];
        for (let i = 0; i < texts.length; i += this.batchSize) {
          const batch = texts.slice(i, i + this.batchSize);
          for (const text of batch) {
            const res = await this.fetchImpl(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ inputs: text }),
              signal: AbortSignal.timeout(this.timeoutMs)
            });
            if (!res.ok) {
              const t = await res.text();
              throw new Error(`hf_inference: HTTP ${res.status} ${t.slice(0, 400)}`);
            }
            const raw = await res.json();
            out.push(normalizeFeatureExtractionPayload(raw));
          }
        }
        return out;
      }
    };
    exports2.HfInferenceEmbeddingProvider = HfInferenceEmbeddingProvider;
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/resolveEmbeddingProvider.js
var require_resolveEmbeddingProvider = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/resolveEmbeddingProvider.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.resolveEmbeddingProvider = resolveEmbeddingProvider;
    var embeddingProvider_1 = require_embeddingProvider();
    var hfInferenceEmbeddingProvider_1 = require_hfInferenceEmbeddingProvider();
    function normBackend(raw) {
      const v = (raw ?? "auto").trim().toLowerCase();
      if (v === "hf_inference" || v === "hf-inference") {
        return "hf_inference";
      }
      if (v === "histogram" || v === "openai_compatible" || v === "openai-compatible") {
        return v === "openai-compatible" ? "openai_compatible" : v;
      }
      return "auto";
    }
    function embeddingBatchSize(env3) {
      const n = parseInt(env3.TONIC_EMBEDDING_BATCH_SIZE ?? "32", 10);
      return Number.isFinite(n) && n > 0 ? n : 32;
    }
    function resolveApiKey(env3) {
      const envVar = (env3.TONIC_EMBEDDING_API_KEY_ENV ?? "").trim();
      if (envVar && env3[envVar]) {
        return String(env3[envVar]);
      }
      return (env3.TONIC_EMBEDDING_API_KEY ?? "").trim();
    }
    function resolveEmbeddingProvider(env3 = process.env) {
      const backend = normBackend(env3.TONIC_EMBEDDING_BACKEND);
      if (backend === "hf_inference") {
        const model2 = (env3.TONIC_HF_EMBED_MODEL ?? "sentence-transformers/all-MiniLM-L6-v2").trim() || "sentence-transformers/all-MiniLM-L6-v2";
        const urlOverride = (env3.TONIC_HF_EMBED_INFERENCE_URL ?? "").trim();
        return new hfInferenceEmbeddingProvider_1.HfInferenceEmbeddingProvider({
          model: model2,
          batchSize: embeddingBatchSize(env3),
          fetchImpl: globalThis.fetch,
          inferenceUrlTemplate: urlOverride || void 0,
          inferenceProvider: (env3.TONIC_HF_INFERENCE_PROVIDER ?? "").trim(),
          env: env3,
          resolveToken: () => String(env3.HF_TOKEN ?? "").trim()
        });
      }
      const baseUrl = (env3.TONIC_EMBEDDING_BASE_URL ?? env3.TONIC_LLAMACPP_URL ?? "").trim();
      const useHttp = backend === "openai_compatible" || backend === "auto" && Boolean(baseUrl);
      if (!useHttp) {
        return new embeddingProvider_1.HistogramEmbeddingProvider();
      }
      if (!baseUrl) {
        return new embeddingProvider_1.HistogramEmbeddingProvider();
      }
      const model = (env3.TONIC_EMBEDDING_MODEL ?? "text-embedding-3-small").trim() || "text-embedding-3-small";
      return new embeddingProvider_1.OpenAiCompatibleEmbeddingProvider({
        baseUrl,
        model,
        apiKey: resolveApiKey(env3),
        batchSize: embeddingBatchSize(env3)
      });
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/indexer/indexer.js
var require_indexer = __commonJS({
  "../../packages/tonic-coding-hydration/dist/indexer/indexer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.indexAstChunks = indexAstChunks;
    var astGrepChunker_1 = require_astGrepChunker();
    var embeddingProvider_1 = require_embeddingProvider();
    async function indexAstChunks(repoRoot, matches, index, embedder, metadataSource = "memory") {
      const chunks = (0, astGrepChunker_1.chunksFromAstArtifact)(repoRoot, matches);
      const provider = embedder ?? new embeddingProvider_1.HistogramEmbeddingProvider();
      const texts = chunks.map((c) => `${c.path}
${c.text}`);
      const embeddings = await provider.embedBatch(texts);
      const records = chunks.map((c, i) => ({
        id: c.ast_match_id ?? `chunk-${i}`,
        document: `${c.path}
${c.text}`,
        embedding: embeddings[i],
        metadata: {
          path: c.path,
          start_line: c.start_line,
          end_line: c.end_line,
          source: metadataSource,
          ast_rule_id: c.ast_rule_id,
          ast_match_id: c.ast_match_id
        }
      }));
      await index.upsert(records);
      return { chunkCount: records.length, rulepackNote: "ast-grep-v1" };
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/retrievalBackend.js
var require_retrievalBackend = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/retrievalBackend.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.runRetrievalForHydrate = runRetrievalForHydrate;
    var indexer_1 = require_indexer();
    var chromaHttpIndex_1 = require_chromaHttpIndex();
    var chromaVectorIndex_1 = require_chromaVectorIndex();
    var attachAstMetadata_1 = require_attachAstMetadata();
    var astGrepChunker_1 = require_astGrepChunker();
    var buildRetrieval_1 = require_buildRetrieval();
    var resolveEmbeddingProvider_1 = require_resolveEmbeddingProvider();
    function backendFromEnv(env3) {
      const v = (env3.TONIC_RETRIEVAL_BACKEND ?? "memory").trim().toLowerCase();
      return v === "chroma" ? "chroma" : "memory";
    }
    async function runChromaRetrievalForHydrate(params, embedder, fetchImpl, env3) {
      const cfgBase = (0, chromaHttpIndex_1.chromaConfigFromEnv)(env3);
      if (!cfgBase) {
        throw new Error("TONIC_RETRIEVAL_BACKEND=chroma requires TONIC_CHROMA_URL");
      }
      const chunks = (0, astGrepChunker_1.chunksFromAstArtifact)(params.repoRoot, params.matches);
      if (chunks.length === 0 || params.queries.length === 0) {
        return [];
      }
      const probe = await embedder.embedBatch([" "]);
      const embeddingDim = probe[0]?.length ?? 0;
      if (!embeddingDim) {
        throw new Error("Chroma retrieval: embedder returned empty vector for dimension probe");
      }
      const cfg = { ...cfgBase, embeddingDim };
      const index = new chromaVectorIndex_1.ChromaVectorIndex(cfg, fetchImpl);
      const ids = chunks.map((c, i) => c.ast_match_id ?? `chunk-${i}`);
      await index.deleteIds(ids);
      await (0, indexer_1.indexAstChunks)(params.repoRoot, params.matches, index, embedder, "chroma");
      const astLineMap = (0, attachAstMetadata_1.buildAstLineMapFromMatches)(params.matches);
      const conflictMap = params.conflictRegions && params.conflictRegions.length > 0 ? (0, attachAstMetadata_1.buildConflictMidLineMap)(params.conflictRegions) : void 0;
      const queryEmbeddings = await embedder.embedBatch(params.queries);
      const collected = [];
      for (let qi = 0; qi < params.queries.length; qi++) {
        const qEmb = queryEmbeddings[qi];
        const res = await index.query(qEmb, params.topKPerQuery);
        for (let i = 0; i < res.ids.length; i++) {
          collected.push({
            chunk_id: res.ids[i],
            text: res.documents[i] ?? "",
            score: 1 - (res.distances?.[i] ?? 0),
            metadata: { ...res.metadatas[i] ?? {} }
          });
        }
      }
      const best = /* @__PURE__ */ new Map();
      for (const h of collected) {
        const prev = best.get(h.chunk_id);
        if (!prev || h.score > prev.score) {
          best.set(h.chunk_id, h);
        }
      }
      const merged = [...best.values()].sort((a, b) => b.score - a.score);
      const cap = params.topKPerQuery * Math.max(1, params.queries.length);
      return (0, attachAstMetadata_1.attachAstMetadata)(merged.slice(0, cap), astLineMap, conflictMap);
    }
    async function runRetrievalForHydrate(params) {
      const env3 = params.env ?? (typeof process !== "undefined" ? process.env : {});
      const backend = params.retrievalBackend ?? backendFromEnv(env3);
      const embedder = params.embedder ?? (0, resolveEmbeddingProvider_1.resolveEmbeddingProvider)(env3);
      const fetchImpl = params.fetchImpl ?? globalThis.fetch;
      const { retrievalBackend: _rb, env: _e, fetchImpl: _f, ...memRest } = params;
      if (backend === "chroma") {
        try {
          return await runChromaRetrievalForHydrate(memRest, embedder, fetchImpl, env3);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Chroma retrieval failed: ${msg}`);
        }
      }
      return (0, buildRetrieval_1.runMemoryRetrievalForHydrate)({ ...memRest, embedder, env: env3 });
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/tools/hybridSearch.js
var require_hybridSearch = __commonJS({
  "../../packages/tonic-coding-hydration/dist/tools/hybridSearch.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.reciprocalRankFusion = reciprocalRankFusion;
    exports2.hybridMergeHits = hybridMergeHits;
    function reciprocalRankFusion(a, b, k = 60) {
      const scores = /* @__PURE__ */ new Map();
      const byId = /* @__PURE__ */ new Map();
      const add = (list, weight) => {
        list.forEach((hit, i) => {
          const id = hit.chunk_id;
          byId.set(id, hit);
          const rrf = weight / (k + i + 1);
          scores.set(id, (scores.get(id) ?? 0) + rrf);
        });
      };
      add(a, 2);
      add(b, 1);
      return [...scores.entries()].sort((x, y) => y[1] - x[1]).map(([id, s]) => {
        const hit = byId.get(id);
        return { ...hit, score: s };
      });
    }
    function hybridMergeHits(denseRanked, sparseRanked) {
      return reciprocalRankFusion(denseRanked, sparseRanked);
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/tools/regexSearch.js
var require_regexSearch = __commonJS({
  "../../packages/tonic-coding-hydration/dist/tools/regexSearch.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.regexSearchHits = regexSearchHits;
    var MAX_PATTERN_LENGTH = 200;
    function sanitizeRegexPattern(raw) {
      const trimmed = raw.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.length > MAX_PATTERN_LENGTH) {
        return null;
      }
      const dangerousPatterns = [
        /\((?:[^()\\]|\\.)+\)\s*\+\s*\+/,
        /\((?:[^()\\]|\\.)+\)\s*\*\s*\+/,
        /\((?:[^()\\]|\\.)+\)\s*\+\s*\*/,
        /\(\s*\.\s*\+\s*\)\s*\+/
      ];
      for (const re of dangerousPatterns) {
        if (re.test(trimmed)) {
          return null;
        }
      }
      return trimmed;
    }
    function regexSearchHits(hits, pattern) {
      const safePattern = sanitizeRegexPattern(pattern);
      if (!safePattern) {
        return [];
      }
      let re;
      try {
        re = new RegExp(safePattern, "i");
      } catch {
        return [];
      }
      return hits.filter((h) => re.test(h.text));
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/tools/symbolSearch.js
var require_symbolSearch = __commonJS({
  "../../packages/tonic-coding-hydration/dist/tools/symbolSearch.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.symbolSearchHits = symbolSearchHits;
    function symbolSearchHits(hits, symbol) {
      const s = symbol.trim().toLowerCase();
      if (!s) {
        return hits;
      }
      return hits.filter((h) => {
        const rule = String(h.metadata?.ast_rule_id ?? "").toLowerCase();
        const sym = String(h.metadata?.symbol ?? "").toLowerCase();
        return rule.includes(s) || sym.includes(s);
      });
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/retrieval/retrievalHybridStage.js
var require_retrievalHybridStage = __commonJS({
  "../../packages/tonic-coding-hydration/dist/retrieval/retrievalHybridStage.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.applyRetrievalHybridStage = applyRetrievalHybridStage;
    var hybridSearch_1 = require_hybridSearch();
    var regexSearch_1 = require_regexSearch();
    var symbolSearch_1 = require_symbolSearch();
    function applyRetrievalHybridStage(params) {
      let hits = params.denseHits;
      const pattern = params.regexPattern?.trim();
      if (pattern) {
        const sparse = (0, regexSearch_1.regexSearchHits)(hits, pattern);
        hits = (0, hybridSearch_1.hybridMergeHits)(hits, sparse);
      }
      const sym = params.symbolFilter?.trim();
      if (sym) {
        const boosted = (0, symbolSearch_1.symbolSearchHits)(hits, sym);
        if (boosted.length === 0) {
          return hits;
        }
        const rest = hits.filter((h) => !boosted.some((b) => b.chunk_id === h.chunk_id));
        return [...boosted, ...rest];
      }
      return hits;
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/agent/codeWalkAgent.js
var require_codeWalkAgent = __commonJS({
  "../../packages/tonic-coding-hydration/dist/agent/codeWalkAgent.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildBatchCodeWalkTrace = buildBatchCodeWalkTrace;
    function buildBatchCodeWalkTrace(params) {
      const insights = [];
      insights.push(`Ast structural matches available: ${params.astMatchCount}; conflict regions: ${params.conflictRegionCount}.`);
      for (const h of params.retrievalHits.slice(0, 8)) {
        const p = h.metadata?.path ?? "";
        const sl = h.metadata?.start_line ?? "";
        const el = h.metadata?.end_line ?? "";
        insights.push(`Chunk ${h.chunk_id} @ ${p} L${sl}-${el} score=${h.score.toFixed(4)}`);
      }
      return {
        schema: "tonic-code-walk-trace",
        version: "1",
        plan: [
          {
            id: "batch-1",
            goal: "Summarize retrieval + structural context for downstream LLM",
            mode: "deterministic"
          }
        ],
        steps: [
          {
            tool: "batch_context",
            outcome: {
              chunks: params.retrievalHits.slice(0, 12).map((h) => ({
                filePath: String(h.metadata?.path ?? ""),
                snippet: h.text.slice(0, 600),
                symbol: h.metadata?.ast_rule_id ? String(h.metadata.ast_rule_id) : void 0,
                relevance: h.score
              })),
              insights
            }
          }
        ]
      };
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/agent/interactiveCodeWalk.js
var require_interactiveCodeWalk = __commonJS({
  "../../packages/tonic-coding-hydration/dist/agent/interactiveCodeWalk.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.enrichCodeWalkTraceWithLlmReflection = enrichCodeWalkTraceWithLlmReflection;
    async function enrichCodeWalkTraceWithLlmReflection(trace, params) {
      const apiKey = (params.env.OPENAI_API_KEY ?? params.env.TONIC_OPENAI_API_KEY ?? "").trim();
      const baseUrl = (params.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
      const model = (params.env.TONIC_CODE_WALK_MODEL ?? params.env.TONIC_LLM_MODEL ?? "gpt-4o-mini").trim();
      const topChunks = params.retrievalHits.slice(0, 10).map((h) => ({
        path: h.metadata?.path,
        lines: `${h.metadata?.start_line ?? ""}-${h.metadata?.end_line ?? ""}`,
        text: h.text.slice(0, 400)
      }));
      if (!apiKey) {
        return {
          ...trace,
          steps: [
            ...trace.steps,
            {
              tool: "llm_reflection",
              outcome: {
                insights: [
                  "Interactive code-walk reflection skipped: set OPENAI_API_KEY (or TONIC_OPENAI_API_KEY) to enable --enable-code-walk-agent."
                ],
                mode: "skipped_no_credentials"
              }
            }
          ]
        };
      }
      const user = [
        "Merge intents:",
        `LEFT: ${params.leftIntent}`,
        `RIGHT: ${params.rightIntent}`,
        "",
        "Top retrieval chunks (JSON):",
        JSON.stringify(topChunks, null, 2),
        "",
        'Reply with compact JSON only: {"insights": string[], "plan_note": string} summarizing what to inspect next for resolving the merge. Max 5 insights.'
      ].join("\n");
      const fetchFn = params.fetchImpl ?? globalThis.fetch;
      if (typeof fetchFn !== "function") {
        return {
          ...trace,
          steps: [
            ...trace.steps,
            {
              tool: "llm_reflection",
              outcome: {
                insights: ["Interactive reflection skipped: no fetch implementation in this runtime."],
                mode: "skipped_no_fetch"
              }
            }
          ]
        };
      }
      try {
        const res = await fetchFn(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
              {
                role: "system",
                content: "You help engineers navigate code during merge hydration. Output only valid JSON with keys insights (array of short strings) and plan_note (string)."
              },
              { role: "user", content: user }
            ]
          })
        });
        const raw = await res.json();
        const text = raw.choices?.[0]?.message?.content?.trim() ?? "";
        let insights = [text.slice(0, 2e3)];
        let planNote = "";
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed.insights)) {
            insights = parsed.insights.map((x) => String(x)).filter(Boolean);
          }
          if (typeof parsed.plan_note === "string") {
            planNote = parsed.plan_note;
          }
        } catch {
        }
        return {
          ...trace,
          plan: [
            ...trace.plan,
            {
              id: "llm-reflection",
              goal: "One-shot reflection over retrieval context",
              mode: "llm"
            }
          ],
          steps: [
            ...trace.steps,
            {
              tool: "llm_reflection",
              outcome: {
                insights,
                plan_note: planNote,
                model,
                mode: "interactive_llm"
              }
            }
          ]
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          ...trace,
          steps: [
            ...trace.steps,
            {
              tool: "llm_reflection",
              outcome: {
                insights: [`LLM reflection failed: ${msg}`],
                mode: "error"
              }
            }
          ]
        };
      }
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/agent/codeSearchLoop/tools.js
var require_tools = __commonJS({
  "../../packages/tonic-coding-hydration/dist/agent/codeSearchLoop/tools.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.toolSemanticQuery = toolSemanticQuery;
    exports2.materializeHitPool = materializeHitPool;
    exports2.toolRegexHits = toolRegexHits;
    exports2.toolSymbolHits = toolSymbolHits;
    var regexSearch_1 = require_regexSearch();
    var symbolSearch_1 = require_symbolSearch();
    function queryResultToHits(res) {
      const hits = [];
      for (let i = 0; i < res.ids.length; i++) {
        hits.push({
          chunk_id: res.ids[i],
          text: res.documents[i] ?? "",
          score: 1 - (res.distances?.[i] ?? 0),
          metadata: { ...res.metadatas[i] ?? {} }
        });
      }
      return hits;
    }
    async function toolSemanticQuery(session, query, topK) {
      const [emb] = await session.embedder.embedBatch([query]);
      const res = await session.index.query(emb, topK);
      return queryResultToHits(res);
    }
    async function materializeHitPool(session, topK) {
      const [emb] = await session.embedder.embedBatch(["merge hydration retrieval context"]);
      const res = await session.index.query(emb, topK);
      return queryResultToHits(res);
    }
    function toolRegexHits(pool, pattern) {
      return (0, regexSearch_1.regexSearchHits)(pool, pattern);
    }
    function toolSymbolHits(pool, symbol) {
      return (0, symbolSearch_1.symbolSearchHits)(pool, symbol);
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/agent/codeSearchLoop/runCodeSearchAgentTurns.js
var require_runCodeSearchAgentTurns = __commonJS({
  "../../packages/tonic-coding-hydration/dist/agent/codeSearchLoop/runCodeSearchAgentTurns.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.runCodeSearchAgentTurns = runCodeSearchAgentTurns;
    var tools_1 = require_tools();
    function stripFence(s) {
      const t = s.trim();
      const m = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
      return m ? m[1].trim() : t;
    }
    async function runCodeSearchAgentTurns(params) {
      const steps = [];
      const fetchFn = params.fetchImpl ?? globalThis.fetch;
      const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
      let pool = null;
      for (let turn = 0; turn < params.maxTurns; turn++) {
        const system = 'You choose search tools for merge hydration. Reply JSON only: {"tool":"semantic_query"|"regex_search"|"symbol_search"|"done","query"?:string,"pattern"?:string,"symbol"?:string}. semantic_query uses vector search; regex_search and symbol_search filter a materialized chunk pool.';
        const prior = steps.length ? JSON.stringify(steps.map((s) => ({ tool: s.tool, summary: s.outcome?.summary }))) : "[]";
        const user = `Turn ${turn + 1}/${params.maxTurns}. Prior steps: ${prior}
Pick the next tool or done.`;
        const res = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.apiKey}`
          },
          body: JSON.stringify({
            model: params.model,
            temperature: 0.1,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user }
            ]
          })
        });
        if (!res.ok) {
          const t = await res.text();
          steps.push({
            tool: "llm_error",
            outcome: { message: `HTTP ${res.status}: ${t.slice(0, 400)}` }
          });
          break;
        }
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
        let plan = {};
        try {
          plan = JSON.parse(stripFence(raw));
        } catch {
          steps.push({
            tool: "llm_parse_error",
            outcome: { raw: raw.slice(0, 800) }
          });
          break;
        }
        const tool = (plan.tool ?? "").toLowerCase();
        if (tool === "done") {
          if (turn === 0 && params.seedQuery?.trim()) {
            const hits = await (0, tools_1.toolSemanticQuery)(params.session, params.seedQuery.trim(), 12);
            steps.push({
              tool: "semantic_query",
              outcome: { chunks: hits.slice(0, 8), summary: "seed query (model returned done)" }
            });
          }
          steps.push({ tool: "done", outcome: { reason: "model_done" } });
          break;
        }
        if (tool === "semantic_query" && plan.query?.trim()) {
          const hits = await (0, tools_1.toolSemanticQuery)(params.session, plan.query.trim(), 12);
          steps.push({
            tool: "semantic_query",
            outcome: { chunks: hits.slice(0, 8), query: plan.query.trim() }
          });
          continue;
        }
        if (!pool) {
          pool = await (0, tools_1.materializeHitPool)(params.session, 128);
        }
        if (tool === "regex_search" && plan.pattern) {
          const hits = (0, tools_1.toolRegexHits)(pool, plan.pattern);
          steps.push({
            tool: "regex_search",
            outcome: { chunks: hits.slice(0, 12), pattern: plan.pattern }
          });
          continue;
        }
        if (tool === "symbol_search" && plan.symbol) {
          const hits = (0, tools_1.toolSymbolHits)(pool, plan.symbol);
          steps.push({
            tool: "symbol_search",
            outcome: { chunks: hits.slice(0, 12), symbol: plan.symbol }
          });
          continue;
        }
        steps.push({
          tool: "llm_invalid_tool",
          outcome: { plan }
        });
        break;
      }
      return { steps };
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/tools/astGrepScanTool.js
var require_astGrepScanTool = __commonJS({
  "../../packages/tonic-coding-hydration/dist/tools/astGrepScanTool.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.describeAstGrepScanTool = describeAstGrepScanTool;
    function describeAstGrepScanTool(_req) {
      return "Run merge-tonic ast-grep-hydrate or sg scan with --rule / --config; binary must be on PATH.";
    }
  }
});

// ../../packages/tonic-coding-hydration/dist/index.js
var require_dist = __commonJS({
  "../../packages/tonic-coding-hydration/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.describeAstGrepScanTool = exports2.reciprocalRankFusion = exports2.hybridMergeHits = exports2.regexSearchHits = exports2.symbolSearchHits = exports2.runCodeSearchAgentTurns = exports2.enrichCodeWalkTraceWithLlmReflection = exports2.buildBatchCodeWalkTrace = exports2.indexAstChunks = exports2.buildConflictMidLineMap = exports2.buildAstLineMapFromMatches = exports2.attachAstMetadata = exports2.applyRetrievalHybridStage = exports2.runRetrievalForHydrate = exports2.saveMemoryVectorIndexToPath = exports2.resolveVectorCacheOptions = exports2.parseMemoryVectorIndexArtifact = exports2.loadMemoryVectorIndexFromPath = exports2.contentDigestUtf8 = exports2.buildVectorRecordsWithCache = exports2.embeddingFingerprintFromEnv = exports2.resolveEmbeddingProvider = exports2.hfEmbedInferenceRequestUrl = exports2.HfInferenceEmbeddingProvider = exports2.OpenAiCompatibleEmbeddingProvider = exports2.HistogramEmbeddingProvider = exports2.runMemoryRetrievalForHydrate = exports2.textToEmbedding = exports2.buildRetrievalArtifact = exports2.ChromaVectorIndex = exports2.normalizeChromaBaseUrl = exports2.ChromaHttpIndexUnavailable = exports2.fetchChromaHeartbeat = exports2.assertChromaConfigured = exports2.chromaConfigFromEnv = exports2.createMemoryVectorIndex = exports2.chunksFromAstArtifact = exports2.chunkFileAstGrep = void 0;
    exports2.buildEmptyRetrievalArtifact = buildEmptyRetrievalArtifact;
    var astGrepChunker_1 = require_astGrepChunker();
    Object.defineProperty(exports2, "chunkFileAstGrep", { enumerable: true, get: function() {
      return astGrepChunker_1.chunkFileAstGrep;
    } });
    Object.defineProperty(exports2, "chunksFromAstArtifact", { enumerable: true, get: function() {
      return astGrepChunker_1.chunksFromAstArtifact;
    } });
    var memoryIndex_1 = require_memoryIndex();
    Object.defineProperty(exports2, "createMemoryVectorIndex", { enumerable: true, get: function() {
      return memoryIndex_1.createMemoryVectorIndex;
    } });
    var chromaHttpIndex_1 = require_chromaHttpIndex();
    Object.defineProperty(exports2, "chromaConfigFromEnv", { enumerable: true, get: function() {
      return chromaHttpIndex_1.chromaConfigFromEnv;
    } });
    Object.defineProperty(exports2, "assertChromaConfigured", { enumerable: true, get: function() {
      return chromaHttpIndex_1.assertChromaConfigured;
    } });
    Object.defineProperty(exports2, "fetchChromaHeartbeat", { enumerable: true, get: function() {
      return chromaHttpIndex_1.fetchChromaHeartbeat;
    } });
    Object.defineProperty(exports2, "ChromaHttpIndexUnavailable", { enumerable: true, get: function() {
      return chromaHttpIndex_1.ChromaHttpIndexUnavailable;
    } });
    Object.defineProperty(exports2, "normalizeChromaBaseUrl", { enumerable: true, get: function() {
      return chromaHttpIndex_1.normalizeChromaBaseUrl;
    } });
    var chromaVectorIndex_1 = require_chromaVectorIndex();
    Object.defineProperty(exports2, "ChromaVectorIndex", { enumerable: true, get: function() {
      return chromaVectorIndex_1.ChromaVectorIndex;
    } });
    var buildRetrieval_1 = require_buildRetrieval();
    Object.defineProperty(exports2, "buildRetrievalArtifact", { enumerable: true, get: function() {
      return buildRetrieval_1.buildRetrievalArtifact;
    } });
    Object.defineProperty(exports2, "textToEmbedding", { enumerable: true, get: function() {
      return buildRetrieval_1.textToEmbedding;
    } });
    Object.defineProperty(exports2, "runMemoryRetrievalForHydrate", { enumerable: true, get: function() {
      return buildRetrieval_1.runMemoryRetrievalForHydrate;
    } });
    var embeddingProvider_1 = require_embeddingProvider();
    Object.defineProperty(exports2, "HistogramEmbeddingProvider", { enumerable: true, get: function() {
      return embeddingProvider_1.HistogramEmbeddingProvider;
    } });
    Object.defineProperty(exports2, "OpenAiCompatibleEmbeddingProvider", { enumerable: true, get: function() {
      return embeddingProvider_1.OpenAiCompatibleEmbeddingProvider;
    } });
    var hfInferenceEmbeddingProvider_1 = require_hfInferenceEmbeddingProvider();
    Object.defineProperty(exports2, "HfInferenceEmbeddingProvider", { enumerable: true, get: function() {
      return hfInferenceEmbeddingProvider_1.HfInferenceEmbeddingProvider;
    } });
    Object.defineProperty(exports2, "hfEmbedInferenceRequestUrl", { enumerable: true, get: function() {
      return hfInferenceEmbeddingProvider_1.hfEmbedInferenceRequestUrl;
    } });
    var resolveEmbeddingProvider_1 = require_resolveEmbeddingProvider();
    Object.defineProperty(exports2, "resolveEmbeddingProvider", { enumerable: true, get: function() {
      return resolveEmbeddingProvider_1.resolveEmbeddingProvider;
    } });
    var embeddingFingerprint_1 = require_embeddingFingerprint();
    Object.defineProperty(exports2, "embeddingFingerprintFromEnv", { enumerable: true, get: function() {
      return embeddingFingerprint_1.embeddingFingerprintFromEnv;
    } });
    var memoryVectorSnapshot_1 = require_memoryVectorSnapshot();
    Object.defineProperty(exports2, "buildVectorRecordsWithCache", { enumerable: true, get: function() {
      return memoryVectorSnapshot_1.buildVectorRecordsWithCache;
    } });
    Object.defineProperty(exports2, "contentDigestUtf8", { enumerable: true, get: function() {
      return memoryVectorSnapshot_1.contentDigestUtf8;
    } });
    Object.defineProperty(exports2, "loadMemoryVectorIndexFromPath", { enumerable: true, get: function() {
      return memoryVectorSnapshot_1.loadMemoryVectorIndexFromPath;
    } });
    Object.defineProperty(exports2, "parseMemoryVectorIndexArtifact", { enumerable: true, get: function() {
      return memoryVectorSnapshot_1.parseMemoryVectorIndexArtifact;
    } });
    Object.defineProperty(exports2, "resolveVectorCacheOptions", { enumerable: true, get: function() {
      return memoryVectorSnapshot_1.resolveVectorCacheOptions;
    } });
    Object.defineProperty(exports2, "saveMemoryVectorIndexToPath", { enumerable: true, get: function() {
      return memoryVectorSnapshot_1.saveMemoryVectorIndexToPath;
    } });
    var retrievalBackend_1 = require_retrievalBackend();
    Object.defineProperty(exports2, "runRetrievalForHydrate", { enumerable: true, get: function() {
      return retrievalBackend_1.runRetrievalForHydrate;
    } });
    var retrievalHybridStage_1 = require_retrievalHybridStage();
    Object.defineProperty(exports2, "applyRetrievalHybridStage", { enumerable: true, get: function() {
      return retrievalHybridStage_1.applyRetrievalHybridStage;
    } });
    var attachAstMetadata_1 = require_attachAstMetadata();
    Object.defineProperty(exports2, "attachAstMetadata", { enumerable: true, get: function() {
      return attachAstMetadata_1.attachAstMetadata;
    } });
    Object.defineProperty(exports2, "buildAstLineMapFromMatches", { enumerable: true, get: function() {
      return attachAstMetadata_1.buildAstLineMapFromMatches;
    } });
    Object.defineProperty(exports2, "buildConflictMidLineMap", { enumerable: true, get: function() {
      return attachAstMetadata_1.buildConflictMidLineMap;
    } });
    var indexer_1 = require_indexer();
    Object.defineProperty(exports2, "indexAstChunks", { enumerable: true, get: function() {
      return indexer_1.indexAstChunks;
    } });
    var codeWalkAgent_1 = require_codeWalkAgent();
    Object.defineProperty(exports2, "buildBatchCodeWalkTrace", { enumerable: true, get: function() {
      return codeWalkAgent_1.buildBatchCodeWalkTrace;
    } });
    var interactiveCodeWalk_1 = require_interactiveCodeWalk();
    Object.defineProperty(exports2, "enrichCodeWalkTraceWithLlmReflection", { enumerable: true, get: function() {
      return interactiveCodeWalk_1.enrichCodeWalkTraceWithLlmReflection;
    } });
    var runCodeSearchAgentTurns_1 = require_runCodeSearchAgentTurns();
    Object.defineProperty(exports2, "runCodeSearchAgentTurns", { enumerable: true, get: function() {
      return runCodeSearchAgentTurns_1.runCodeSearchAgentTurns;
    } });
    var symbolSearch_1 = require_symbolSearch();
    Object.defineProperty(exports2, "symbolSearchHits", { enumerable: true, get: function() {
      return symbolSearch_1.symbolSearchHits;
    } });
    var regexSearch_1 = require_regexSearch();
    Object.defineProperty(exports2, "regexSearchHits", { enumerable: true, get: function() {
      return regexSearch_1.regexSearchHits;
    } });
    var hybridSearch_1 = require_hybridSearch();
    Object.defineProperty(exports2, "hybridMergeHits", { enumerable: true, get: function() {
      return hybridSearch_1.hybridMergeHits;
    } });
    Object.defineProperty(exports2, "reciprocalRankFusion", { enumerable: true, get: function() {
      return hybridSearch_1.reciprocalRankFusion;
    } });
    var astGrepScanTool_1 = require_astGrepScanTool();
    Object.defineProperty(exports2, "describeAstGrepScanTool", { enumerable: true, get: function() {
      return astGrepScanTool_1.describeAstGrepScanTool;
    } });
    function buildEmptyRetrievalArtifact() {
      return { schema: "tonic-retrieval-hydration", version: "1", hits: [] };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/pipeline.js
var require_pipeline = __commonJS({
  "../../packages/tonic-core/dist/hydration/pipeline.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.runHydrationPipeline = runHydrationPipeline;
    var node_child_process_1 = require("node:child_process");
    var crypto = __importStar(require("node:crypto"));
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var artifact_1 = require_artifact();
    var command_1 = require_command();
    var runner_1 = require_runner();
    var types_1 = require_types();
    var astRefinementExcerpt_1 = require_astRefinementExcerpt();
    var buildIntentHydration_1 = require_buildIntentHydration();
    var conflictHunkExcerpt_1 = require_conflictHunkExcerpt();
    var conflictGate_1 = require_conflictGate();
    var conflictScan_1 = require_conflictScan();
    var hydrationPhase_1 = require_hydrationPhase();
    var hydrationConfig_1 = require_hydrationConfig();
    var intentBootstrap_1 = require_intentBootstrap();
    var repoStructure_1 = require_repoStructure();
    var questionRefinement_1 = require_questionRefinement();
    function pathsFor(outDir) {
      const d = path2.resolve(outDir);
      return {
        intentBootstrap: path2.join(d, "intent-bootstrap.json"),
        questionRefinement: path2.join(d, "question-refinement.json"),
        questionRefinementPass1: path2.join(d, "question-refinement.pass1.v1.json"),
        questionRefinementPass2: path2.join(d, "question-refinement.pass2.v1.json"),
        questionRefinementPostRetrieval: path2.join(d, "question-refinement.post-retrieval.v1.json"),
        repoStructure: path2.join(d, "repo-structure.json"),
        conflictContext: path2.join(d, "conflict-context.json"),
        conflictHunkExcerpts: path2.join(d, "conflict-hunk-excerpts.json"),
        astHydration: path2.join(d, "ast-hydration.json"),
        retrieval: path2.join(d, "retrieval-hydration.json"),
        codeWalk: path2.join(d, "code-walk-trace.json"),
        intentHydration: path2.join(d, "intent-hydration.json"),
        run: path2.join(d, "hydration-run.json")
      };
    }
    async function runRefinementPassRich(cfg, mode, ctx) {
      const r = await (0, questionRefinement_1.runQuestionRefinement)({
        mode,
        config: cfg,
        leftIntent: ctx.left,
        rightIntent: ctx.right,
        conflictRegionsJson: ctx.conflictJson,
        repoStructureExcerpt: ctx.repoExcerpt,
        priorPhasesDigest: ctx.priorPhasesDigest ?? "",
        priorRefinementPassLabel: ctx.priorRefinementPassLabel,
        userQuery: ctx.userQuery,
        followUp: ctx.followUp,
        conflictHunksExcerptJson: ctx.conflictHunksExcerptJson,
        astMatchesExcerptJson: ctx.astMatchesExcerptJson,
        retrievalHitsPreR1Json: ctx.retrievalHitsPreR1Json,
        retrievalHitsPass2Json: ctx.retrievalHitsPass2Json ?? "[]",
        repoHeadShort: ctx.repoHeadShort,
        mergeBranchHints: ctx.mergeBranchHints,
        env: ctx.env,
        fetchImpl: ctx.fetchImpl
      });
      if (r.kind === "fail") {
        return { ok: false, message: r.message, code: r.code };
      }
      return {
        ok: true,
        artifact: r.artifact,
        skippedLlm: r.skippedLlm,
        warning: r.warning
      };
    }
    function readRepoHead(repoRoot) {
      try {
        const o = (0, node_child_process_1.execSync)("git rev-parse HEAD", {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"]
        }).trim();
        return o || null;
      } catch {
        return null;
      }
    }
    function resolveArtifactPathFromRunFile(runFileAbs, rel) {
      if (rel == null) {
        return null;
      }
      const t = String(rel).trim();
      if (!t) {
        return null;
      }
      if (path2.isAbsolute(t)) {
        return t;
      }
      return path2.resolve(path2.dirname(runFileAbs), t);
    }
    function hashRulesetFile(repoRoot, ruleset) {
      if (!ruleset || ruleset === "default") {
        return null;
      }
      const rp = path2.isAbsolute(ruleset) ? ruleset : path2.resolve(repoRoot, ruleset);
      try {
        return crypto.createHash("sha256").update(fs2.readFileSync(rp)).digest("hex");
      } catch {
        return null;
      }
    }
    function pushSkippedHydrateStages(pushStage, ids) {
      for (const id of ids) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id,
          status: "skipped",
          artifact_path: null,
          started_at: st,
          finished_at: st
        });
      }
    }
    function writeHydrationRunEnvelope(p, args) {
      const status = args.exitCode === types_1.EXIT_OK ? "ok" : args.exitCode === types_1.EXIT_PARTIAL ? "partial" : "failed";
      (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
        runId: args.runId,
        status,
        exitCode: args.exitCode,
        errors: args.errors,
        warnings: args.warnings,
        inputs: args.runInputs(),
        timingMs: Date.now() - args.t0,
        astEvidencePath: args.astEvidencePath,
        pipeline: { stages: args.stages, source_config: args.sourceConfig }
      }));
      const runObj = JSON.parse(fs2.readFileSync(p.run, "utf8"));
      runObj.intent_bootstrap_path = args.pathPatch.intent_bootstrap_path ?? null;
      runObj.question_refinement_path = args.pathPatch.question_refinement_path ?? null;
      runObj.conflict_context_path = args.pathPatch.conflict_context_path ?? null;
      runObj.repo_structure_path = args.pathPatch.repo_structure_path ?? null;
      runObj.retrieval_path = args.pathPatch.retrieval_path ?? null;
      runObj.code_walk_trace_path = args.pathPatch.code_walk_trace_path ?? null;
      runObj.intent_hydration_path = args.pathPatch.intent_hydration_path ?? null;
      runObj.prior_run_path = args.priorRunPath;
      (0, artifact_1.writeUtf8Json)(p.run, runObj);
    }
    async function runHydrationPipeline(opts) {
      const t0 = Date.now();
      const runId = crypto.randomUUID();
      const p = pathsFor(opts.outDir);
      const stages = [];
      const warnings = [];
      const errors = [];
      const cfg = (0, hydrationConfig_1.resolveHydrationConfig)(opts.hydrationConfigPath || void 0, opts.env, {
        questionMode: opts.questionModeCli,
        strictLlm: opts.strictLlm,
        llmModel: opts.llmModel || void 0,
        llmBaseUrl: opts.llmBaseUrl || void 0,
        openaiApiKeyEnv: opts.openaiApiKeyEnv || void 0
      });
      const repoHead = readRepoHead(opts.repoRoot);
      let loadedPrior = null;
      const priorTrim = opts.priorRunPath.trim();
      if (priorTrim) {
        const pr = path2.isAbsolute(priorTrim) ? priorTrim : path2.resolve(opts.repoRoot, priorTrim);
        if (!fs2.existsSync(pr)) {
          console.error(`merge-tonic hydrate: --prior-run file not found: ${pr}`);
          return types_1.EXIT_INVALID_ARGS;
        }
        try {
          const doc = JSON.parse(fs2.readFileSync(pr, "utf8"));
          loadedPrior = {
            fileAbs: pr,
            doc,
            resolved: {
              ast: resolveArtifactPathFromRunFile(pr, doc.ast_evidence_path ?? null),
              retrieval: resolveArtifactPathFromRunFile(pr, doc.retrieval_path ?? null),
              code_walk: resolveArtifactPathFromRunFile(pr, doc.code_walk_trace_path ?? null)
            }
          };
          const prior = doc;
          const pRepo = typeof prior.inputs?.repo === "string" ? prior.inputs.repo.replace(/\\/g, "/") : "";
          const cur = path2.resolve(opts.repoRoot).replace(/\\/g, "/");
          if (pRepo && pRepo !== cur) {
            if (!opts.forcePriorRun) {
              console.error("merge-tonic hydrate: prior run repo mismatch; use --force-prior to override.\n  prior:", pRepo, "\n  current:", cur);
              return types_1.EXIT_INVALID_ARGS;
            }
            warnings.push({
              code: "prior_run_repo_mismatch",
              message: `prior run repo overridden (${pRepo} vs ${cur})`
            });
          }
          const pHead = typeof prior.inputs?.repo_head === "string" ? prior.inputs.repo_head.trim() : "";
          if (pHead && repoHead && pHead !== repoHead && !opts.forcePriorRun) {
            console.error("merge-tonic hydrate: prior run repo_head mismatch; use --force-prior.\n  prior:", pHead, "\n  current:", repoHead);
            return types_1.EXIT_INVALID_ARGS;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`merge-tonic hydrate: invalid --prior-run JSON: ${msg}`);
          return types_1.EXIT_INVALID_ARGS;
        }
      }
      const astParsed = (0, command_1.parseAstGrepHydrateArgv)(["--repo", opts.repoRoot, ...opts.astArgv]);
      if (!astParsed.ok) {
        console.error(astParsed.message);
        return types_1.EXIT_INVALID_ARGS;
      }
      let astOpts = astParsed.opts;
      if (!astOpts.outPath || astOpts.outPath === path2.join(opts.repoRoot, ".tonic", "ast-hydration.json")) {
        astOpts = { ...astOpts, outPath: p.astHydration, runOutPath: p.run };
      } else {
        astOpts = { ...astOpts, outPath: p.astHydration };
      }
      const rulesetHash = hashRulesetFile(opts.repoRoot, astOpts.ruleset);
      if (loadedPrior && rulesetHash) {
        const ins = loadedPrior.doc.inputs;
        const priorRh = typeof ins?.ruleset_hash === "string" ? ins.ruleset_hash.trim() : "";
        if (priorRh && priorRh !== rulesetHash) {
          if (!opts.forcePriorRun) {
            console.error("merge-tonic hydrate: prior run ruleset_hash mismatch; use --force-prior to override.\n  prior:", priorRh, "\n  current:", rulesetHash);
            return types_1.EXIT_INVALID_ARGS;
          }
          warnings.push({
            code: "prior_run_ruleset_mismatch",
            message: "ruleset fingerprint differed from prior run; continuing due to --force-prior"
          });
        }
      }
      let exitCode = types_1.EXIT_OK;
      const px = opts.hydratePhaseMax;
      const envRb = (opts.env.TONIC_RETRIEVAL_BACKEND ?? "").trim();
      const effBackendStr = (envRb || opts.retrievalBackend || "memory").trim().toLowerCase();
      const effRetrievalBackend = effBackendStr === "chroma" ? "chroma" : "memory";
      const mkSourceConfig = () => ({
        retrieval: opts.enableRetrieval,
        retrieval_backend: effBackendStr,
        code_walk: opts.enableCodeWalk,
        code_walk_agent: opts.enableCodeWalkAgent,
        code_walk_search_agent: opts.enableCodeWalkSearchAgent,
        source_priority: opts.sourcePriority
      });
      const pushStage = (s) => {
        stages.push(s);
      };
      let conflictGateExtra = {};
      let questionRefinementChain = [];
      let postRetrievalArt = null;
      const runInputs = () => ({
        repo: opts.repoRoot,
        out_dir: opts.outDir,
        prior_run: opts.priorRunPath || null,
        repo_head: repoHead,
        ruleset_hash: rulesetHash,
        user_query: opts.userQuery?.trim() || null,
        follow_up: opts.followUp?.trim() || null,
        ...conflictGateExtra
      });
      const emptyConflict = {
        schema: "tonic-conflict-context",
        version: "1",
        scan_scope: "workspace",
        conflict_regions: []
      };
      let conflictArt = emptyConflict;
      const skipConflictScan = (opts.env.TONIC_SKIP_CONFLICT_SCAN ?? "").trim() === "1";
      let conflictHunkStored = null;
      if (px >= hydrationPhase_1.HYDRATE_PHASE_LEVEL.conflicts) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        if (skipConflictScan) {
          conflictArt = { ...emptyConflict, scan_scope: "skipped" };
          (0, conflictScan_1.writeConflictContext)(p.conflictContext, conflictArt);
          pushStage({
            id: "conflicts",
            status: "skipped",
            artifact_path: p.conflictContext.replace(/\\/g, "/"),
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } else {
          conflictArt = (0, conflictScan_1.scanRepoConflictMarkers)(opts.repoRoot);
          (0, conflictScan_1.writeConflictContext)(p.conflictContext, conflictArt);
          pushStage({
            id: "conflicts",
            status: "ok",
            artifact_path: p.conflictContext.replace(/\\/g, "/"),
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          const gate = (0, conflictGate_1.evaluateConflictGate)(opts.env, conflictArt.conflict_regions.length);
          conflictGateExtra = { conflict_gate: gate.outcome };
          const hArt0 = (0, conflictHunkExcerpt_1.buildConflictHunkExcerpts)(opts.repoRoot, conflictArt, opts.env);
          conflictHunkStored = hArt0;
          (0, artifact_1.writeUtf8Json)(p.conflictHunkExcerpts, hArt0);
          if (gate.shouldStop) {
            warnings.push({
              code: "conflict_gate_stop",
              message: gate.outcome.stop_reason ?? "conflict gate"
            });
            exitCode = gate.exitCode;
            pushSkippedHydrateStages(pushStage, [
              "intent_bootstrap",
              "repo_structure",
              "question_refinement",
              "ast_grep",
              "retrieval",
              "code_walk",
              "intent_bundle"
            ]);
            writeHydrationRunEnvelope(p, {
              runId,
              exitCode,
              errors,
              warnings,
              stages,
              runInputs,
              t0,
              astEvidencePath: null,
              sourceConfig: mkSourceConfig(),
              pathPatch: { conflict_context_path: p.conflictContext.replace(/\\/g, "/") },
              priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null
            });
            return exitCode;
          }
        }
      }
      if (skipConflictScan) {
        const hArt1 = (0, conflictHunkExcerpt_1.buildConflictHunkExcerpts)(opts.repoRoot, conflictArt, opts.env);
        conflictHunkStored = hArt1;
        (0, artifact_1.writeUtf8Json)(p.conflictHunkExcerpts, hArt1);
      }
      if (px < hydrationPhase_1.HYDRATE_PHASE_LEVEL.intent_bootstrap) {
        pushSkippedHydrateStages(pushStage, [
          "intent_bootstrap",
          "repo_structure",
          "question_refinement",
          "ast_grep",
          "retrieval",
          "code_walk",
          "intent_bundle"
        ]);
        writeHydrationRunEnvelope(p, {
          runId,
          exitCode,
          errors,
          warnings,
          stages,
          runInputs,
          t0,
          astEvidencePath: null,
          sourceConfig: mkSourceConfig(),
          pathPatch: { conflict_context_path: p.conflictContext.replace(/\\/g, "/") },
          priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null
        });
        return exitCode;
      }
      {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        try {
          const boot = (0, intentBootstrap_1.resolveIntentBootstrap)({
            repoRoot: opts.repoRoot,
            leftIntentFlag: opts.leftIntent || void 0,
            rightIntentFlag: opts.rightIntent || void 0,
            intentPair: opts.intentPair || void 0,
            intentProfilePath: opts.intentProfile || void 0,
            env: opts.env,
            userQuery: opts.userQuery,
            followUp: opts.followUp
          });
          (0, intentBootstrap_1.writeIntentBootstrap)(p.intentBootstrap, boot);
          pushStage({
            id: "intent_bootstrap",
            status: "ok",
            artifact_path: p.intentBootstrap.replace(/\\/g, "/"),
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errors.push({ code: "intent_bootstrap", message: msg });
          pushStage({
            id: "intent_bootstrap",
            status: "failed",
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString(),
            errors: [{ message: msg }]
          });
          (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
            runId,
            status: "failed",
            exitCode: types_1.EXIT_INVALID_ARGS,
            errors,
            warnings,
            inputs: runInputs(),
            timingMs: Date.now() - t0,
            astEvidencePath: null,
            pipeline: { stages, source_config: mkSourceConfig() }
          }));
          return types_1.EXIT_INVALID_ARGS;
        }
      }
      if (px < hydrationPhase_1.HYDRATE_PHASE_LEVEL.repo_structure) {
        pushSkippedHydrateStages(pushStage, [
          "repo_structure",
          "question_refinement",
          "ast_grep",
          "retrieval",
          "code_walk",
          "intent_bundle"
        ]);
        writeHydrationRunEnvelope(p, {
          runId,
          exitCode,
          errors,
          warnings,
          stages,
          runInputs,
          t0,
          astEvidencePath: null,
          sourceConfig: mkSourceConfig(),
          pathPatch: {
            intent_bootstrap_path: p.intentBootstrap.replace(/\\/g, "/"),
            conflict_context_path: p.conflictContext.replace(/\\/g, "/")
          },
          priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null
        });
        return exitCode;
      }
      const bootArtifact = JSON.parse(fs2.readFileSync(p.intentBootstrap, "utf8"));
      const rsArt = (0, repoStructure_1.summarizeRepoStructure)(opts.repoRoot);
      const repoExcerpt = (0, repoStructure_1.repoStructureExcerpt)(rsArt);
      (0, repoStructure_1.writeRepoStructure)(p.repoStructure, rsArt);
      {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id: "repo_structure",
          status: "ok",
          artifact_path: p.repoStructure.replace(/\\/g, "/"),
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      if (px < hydrationPhase_1.HYDRATE_PHASE_LEVEL.ast_grep) {
        pushSkippedHydrateStages(pushStage, ["question_refinement", "ast_grep", "retrieval", "code_walk", "intent_bundle"]);
        writeHydrationRunEnvelope(p, {
          runId,
          exitCode,
          errors,
          warnings,
          stages,
          runInputs,
          t0,
          astEvidencePath: null,
          sourceConfig: mkSourceConfig(),
          pathPatch: {
            intent_bootstrap_path: p.intentBootstrap.replace(/\\/g, "/"),
            conflict_context_path: p.conflictContext.replace(/\\/g, "/"),
            repo_structure_path: p.repoStructure.replace(/\\/g, "/")
          },
          priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null
        });
        return exitCode;
      }
      let astResult = (0, runner_1.runAstGrepScan)(astOpts);
      {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        if (astResult.kind === "missing_binary") {
          errors.push({ code: "ast_grep_missing", message: astResult.message });
          pushStage({
            id: "ast_grep",
            status: "failed",
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
            runId,
            status: "failed",
            exitCode: types_1.EXIT_AST_GREP_MISSING,
            errors,
            warnings,
            inputs: runInputs(),
            timingMs: Date.now() - t0,
            astEvidencePath: null,
            pipeline: { stages, source_config: mkSourceConfig() }
          }));
          return types_1.EXIT_AST_GREP_MISSING;
        }
        if (astResult.kind === "invalid_args") {
          errors.push({ code: "invalid_args", message: astResult.message });
          pushStage({ id: "ast_grep", status: "failed", started_at: st, finished_at: (/* @__PURE__ */ new Date()).toISOString() });
          (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
            runId,
            status: "failed",
            exitCode: types_1.EXIT_INVALID_ARGS,
            errors,
            warnings,
            inputs: runInputs(),
            timingMs: Date.now() - t0,
            astEvidencePath: null,
            pipeline: { stages, source_config: mkSourceConfig() }
          }));
          return types_1.EXIT_INVALID_ARGS;
        }
        if (astResult.kind === "exec_failed" || astResult.kind === "parse_failed") {
          const msg = astResult.kind === "exec_failed" ? `ast-grep exited ${astResult.code ?? "?"}` : astResult.message;
          errors.push({
            code: "scan_failed",
            message: msg,
            detail: astResult.kind === "exec_failed" ? astResult.stderr : void 0
          });
          pushStage({ id: "ast_grep", status: "failed", started_at: st, finished_at: (/* @__PURE__ */ new Date()).toISOString() });
          (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
            runId,
            status: "failed",
            exitCode: types_1.EXIT_SCAN_FAILED,
            errors,
            warnings,
            inputs: runInputs(),
            timingMs: Date.now() - t0,
            astEvidencePath: null,
            pipeline: { stages, source_config: mkSourceConfig() }
          }));
          return types_1.EXIT_SCAN_FAILED;
        }
        warnings.push(...astResult.warnings);
        if (astResult.truncated || astResult.warnings.length > 0) {
          exitCode = types_1.EXIT_PARTIAL;
        }
        const langs = astOpts.languages.trim().toLowerCase() === "auto" || !astOpts.languages.trim() ? ["auto"] : astOpts.languages.split(",").map((s) => s.trim()).filter(Boolean);
        const ast = (0, artifact_1.buildAstHydrationJson)({
          repoRoot: opts.repoRoot,
          ruleset: astOpts.ruleset,
          languages: langs,
          scanScope: astOpts.changedOnly ? "changed-only" : "full",
          toolVersion: astResult.toolVersion,
          matches: astResult.matches,
          truncated: astResult.truncated
        });
        (0, artifact_1.writeUtf8Json)(p.astHydration, ast);
        pushStage({
          id: "ast_grep",
          status: astResult.truncated || astResult.warnings.length ? "partial" : "ok",
          artifact_path: p.astHydration.replace(/\\/g, "/"),
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      const astRead = JSON.parse(fs2.readFileSync(p.astHydration, "utf8"));
      if (px < hydrationPhase_1.HYDRATE_PHASE_LEVEL.question_refinement) {
        pushSkippedHydrateStages(pushStage, ["question_refinement", "retrieval", "code_walk", "intent_bundle"]);
        writeHydrationRunEnvelope(p, {
          runId,
          exitCode,
          errors,
          warnings,
          stages,
          runInputs,
          t0,
          astEvidencePath: p.astHydration.replace(/\\/g, "/"),
          sourceConfig: mkSourceConfig(),
          pathPatch: {
            intent_bootstrap_path: p.intentBootstrap.replace(/\\/g, "/"),
            conflict_context_path: p.conflictContext.replace(/\\/g, "/"),
            repo_structure_path: p.repoStructure.replace(/\\/g, "/")
          },
          priorRunPath: opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null
        });
        return exitCode;
      }
      const hunkArt = conflictHunkStored ?? (0, conflictHunkExcerpt_1.buildConflictHunkExcerpts)(opts.repoRoot, conflictArt, opts.env);
      const hunkJson = (0, conflictHunkExcerpt_1.conflictHunkExcerptsToPromptJson)(hunkArt);
      const astExcerptJson = (0, astRefinementExcerpt_1.formatAstMatchesExcerptJson)(astRead, opts.env);
      const repoHeadShort = (repoHead ?? "").trim().slice(0, 7);
      const mergeHints = (0, conflictHunkExcerpt_1.mergeBranchHintsFromRegions)(conflictArt.conflict_regions);
      const conflictJson = JSON.stringify(conflictArt.conflict_regions);
      let preR1Hits = [];
      const skipPreR1 = (opts.env.TONIC_SKIP_PRE_R1_RETRIEVAL ?? "").trim() === "1";
      const preR1TopK = Math.max(1, parseInt(opts.env.TONIC_PRE_R1_RETRIEVAL_TOPK ?? "", 10) || 6);
      if (opts.enableRetrieval && !skipPreR1) {
        const ch = await Promise.resolve().then(() => __importStar(require_dist()));
        const { runRetrievalForHydrate, applyRetrievalHybridStage } = ch;
        const intentQ = `${bootArtifact.left_intent} ${bootArtifact.right_intent}`;
        const queries = [intentQ];
        for (const r of conflictArt.conflict_regions.slice(0, 12)) {
          queries.push(`merge conflict ${r.path}`);
        }
        const vectorCacheWarnings = [];
        try {
          preR1Hits = await runRetrievalForHydrate({
            repoRoot: opts.repoRoot,
            matches: astRead.matches,
            queries,
            topKPerQuery: preR1TopK,
            conflictRegions: conflictArt.conflict_regions,
            retrievalBackend: effRetrievalBackend,
            env: opts.env,
            fetchImpl: opts.fetchImpl,
            vectorCachePath: opts.vectorCachePath.trim() || void 0,
            vectorCacheMode: opts.vectorCacheMode.trim() || void 0,
            vectorCacheDiagnostics: {
              ruleset_hash: rulesetHash || void 0,
              repo_head: repoHead || void 0
            },
            vectorCacheWarningsOut: vectorCacheWarnings
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push({ code: "retrieval_pre_r1_failed", message: msg.slice(0, 500) });
          if (exitCode === types_1.EXIT_OK) {
            exitCode = types_1.EXIT_PARTIAL;
          }
        }
        for (const w of vectorCacheWarnings) {
          warnings.push({ code: w.code, message: w.message });
        }
        const hybridRe = (opts.retrievalHybridRegex || opts.env.TONIC_RETRIEVAL_HYBRID_REGEX || "").trim() || void 0;
        const hybridSym = (opts.retrievalSymbolBoost || opts.env.TONIC_RETRIEVAL_SYMBOL || "").trim() || void 0;
        if (hybridRe || hybridSym) {
          preR1Hits = applyRetrievalHybridStage({
            denseHits: preR1Hits,
            regexPattern: hybridRe,
            symbolFilter: hybridSym
          });
        }
      }
      const preR1Slice = preR1Hits.slice(0, 24).map((h) => ({
        chunk_id: h.chunk_id,
        score: h.score,
        text: (h.text ?? "").slice(0, 400),
        metadata: h.metadata
      }));
      const preR1Json = JSON.stringify(preR1Slice, null, 2);
      let questionArt = null;
      const refinementMode = cfg.questionMode;
      const richCtx = {
        conflictJson,
        repoExcerpt,
        env: opts.env,
        fetchImpl: opts.fetchImpl,
        userQuery: opts.userQuery ?? "",
        followUp: opts.followUp ?? "",
        conflictHunksExcerptJson: hunkJson,
        astMatchesExcerptJson: astExcerptJson,
        retrievalHitsPreR1Json: preR1Json,
        repoHeadShort,
        mergeBranchHints: mergeHints,
        retrievalHitsPass2Json: "[]"
      };
      if (refinementMode !== "off") {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        const r1 = await runRefinementPassRich(cfg, refinementMode, {
          left: bootArtifact.left_intent,
          right: bootArtifact.right_intent,
          priorRefinementPassLabel: "pass1",
          priorPhasesDigest: "",
          ...richCtx
        });
        if (!r1.ok) {
          errors.push({ code: "question_refinement", message: r1.message });
          pushStage({
            id: "question_refinement",
            status: "failed",
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
          (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
            runId,
            status: "failed",
            exitCode: r1.code,
            errors,
            warnings,
            inputs: runInputs(),
            timingMs: Date.now() - t0,
            astEvidencePath: p.astHydration.replace(/\\/g, "/"),
            pipeline: { stages, source_config: mkSourceConfig() }
          }));
          return r1.code;
        }
        if (r1.warning) {
          warnings.push({ code: "llm_skipped", message: r1.warning });
          exitCode = types_1.EXIT_PARTIAL;
        }
        questionArt = r1.artifact;
        (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinementPass1, questionArt);
        (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinement, questionArt);
        questionRefinementChain.push({
          pass_id: "pass1",
          path: p.questionRefinementPass1.replace(/\\/g, "/")
        });
        pushStage({
          id: "question_refinement",
          status: r1.skippedLlm ? "partial" : "ok",
          artifact_path: p.questionRefinement.replace(/\\/g, "/"),
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        const r0 = await runRefinementPassRich(cfg, "off", {
          left: bootArtifact.left_intent,
          right: bootArtifact.right_intent,
          priorRefinementPassLabel: "off",
          ...richCtx
        });
        if (r0.ok) {
          questionArt = r0.artifact;
          (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinementPass1, questionArt);
          (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinement, questionArt);
          questionRefinementChain.push({
            pass_id: "pass1",
            path: p.questionRefinementPass1.replace(/\\/g, "/")
          });
        }
        pushStage({
          id: "question_refinement",
          status: "ok",
          artifact_path: p.questionRefinement.replace(/\\/g, "/"),
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      let pass2RetrievalJson = "[]";
      let wroteQuestionRefinementPass2 = false;
      const skipR2Retrieval = (opts.env.TONIC_SKIP_R2_RETRIEVAL ?? "").trim() === "1";
      const r2TopK = Math.max(1, parseInt(opts.env.TONIC_R2_RETRIEVAL_TOPK ?? "", 10) || 8);
      if (cfg.refinementContext === "progressive" && refinementMode !== "off" && questionArt && opts.enableRetrieval && !skipR2Retrieval) {
        const ch = await Promise.resolve().then(() => __importStar(require_dist()));
        const { runRetrievalForHydrate, applyRetrievalHybridStage } = ch;
        const leftQ = questionArt.refined_left_intent ?? bootArtifact.left_intent;
        const rightQ = questionArt.refined_right_intent ?? bootArtifact.right_intent;
        const intentQ = `${leftQ} ${rightQ}`;
        const subQs = questionArt.subquestions?.map((s) => s.text) ?? [];
        const queries = [];
        if (opts.sourcePriority === "retrieval-first") {
          queries.push(intentQ);
          for (const t of subQs) {
            queries.push(t);
          }
        } else {
          for (const t of subQs) {
            queries.push(t);
          }
          queries.push(intentQ);
        }
        const vectorCacheWarningsR2 = [];
        try {
          let hits2 = await runRetrievalForHydrate({
            repoRoot: opts.repoRoot,
            matches: astRead.matches,
            queries,
            topKPerQuery: r2TopK,
            conflictRegions: conflictArt.conflict_regions,
            retrievalBackend: effRetrievalBackend,
            env: opts.env,
            fetchImpl: opts.fetchImpl,
            vectorCachePath: opts.vectorCachePath.trim() || void 0,
            vectorCacheMode: opts.vectorCacheMode.trim() || void 0,
            vectorCacheDiagnostics: {
              ruleset_hash: rulesetHash || void 0,
              repo_head: repoHead || void 0
            },
            vectorCacheWarningsOut: vectorCacheWarningsR2
          });
          for (const w of vectorCacheWarningsR2) {
            warnings.push({ code: w.code, message: w.message });
          }
          const hybridRe2 = (opts.retrievalHybridRegex || opts.env.TONIC_RETRIEVAL_HYBRID_REGEX || "").trim() || void 0;
          const hybridSym2 = (opts.retrievalSymbolBoost || opts.env.TONIC_RETRIEVAL_SYMBOL || "").trim() || void 0;
          if (hybridRe2 || hybridSym2) {
            hits2 = applyRetrievalHybridStage({
              denseHits: hits2,
              regexPattern: hybridRe2,
              symbolFilter: hybridSym2
            });
          }
          const slice2 = hits2.slice(0, 24).map((h) => ({
            chunk_id: h.chunk_id,
            score: h.score,
            text: (h.text ?? "").slice(0, 400),
            metadata: h.metadata
          }));
          pass2RetrievalJson = JSON.stringify(slice2, null, 2);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push({ code: "retrieval_pass2_failed", message: msg.slice(0, 500) });
          if (exitCode === types_1.EXIT_OK) {
            exitCode = types_1.EXIT_PARTIAL;
          }
        }
      }
      if (cfg.refinementContext === "progressive" && refinementMode !== "off" && questionArt) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        const left = questionArt.refined_left_intent ?? bootArtifact.left_intent;
        const right = questionArt.refined_right_intent ?? bootArtifact.right_intent;
        const priorDigest = questionArt.context_digest_sha256 ?? (fs2.existsSync(p.intentBootstrap) ? crypto.createHash("sha256").update(fs2.readFileSync(p.intentBootstrap, "utf8")).digest("hex") : "");
        const r2 = await runRefinementPassRich(cfg, refinementMode, {
          left,
          right,
          priorRefinementPassLabel: "pass2",
          priorPhasesDigest: priorDigest,
          ...richCtx,
          retrievalHitsPass2Json: pass2RetrievalJson
        });
        if (!r2.ok) {
          warnings.push({ code: "question_refinement_progressive", message: r2.message });
          pushStage({
            id: "question_refinement_pass2",
            status: "failed",
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } else {
          if (r2.warning) {
            warnings.push({ code: "llm_skipped", message: r2.warning });
            exitCode = types_1.EXIT_PARTIAL;
          }
          questionArt = r2.artifact;
          (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinementPass2, questionArt);
          (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinement, questionArt);
          wroteQuestionRefinementPass2 = true;
          questionRefinementChain.push({
            pass_id: "pass2",
            path: p.questionRefinementPass2.replace(/\\/g, "/")
          });
          pushStage({
            id: "question_refinement_pass2",
            status: r2.skippedLlm ? "partial" : "ok",
            artifact_path: p.questionRefinementPass2.replace(/\\/g, "/"),
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
      let intentLeft = questionArt?.refined_left_intent ?? bootArtifact.left_intent;
      let intentRight = questionArt?.refined_right_intent ?? bootArtifact.right_intent;
      let retrievalPath = null;
      const retrievalHitsForIntent = [];
      if (px < hydrationPhase_1.HYDRATE_PHASE_LEVEL.retrieval) {
        const stSkip = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id: "retrieval",
          status: "skipped",
          artifact_path: null,
          started_at: stSkip,
          finished_at: stSkip
        });
      } else if (opts.enableRetrieval) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        const ch = await Promise.resolve().then(() => __importStar(require_dist()));
        const { buildEmptyRetrievalArtifact, runRetrievalForHydrate, applyRetrievalHybridStage } = ch;
        const intentQ = `${intentLeft} ${intentRight}`;
        const queries = [];
        const subQs = questionArt?.subquestions?.map((s) => s.text) ?? [];
        if (opts.sourcePriority === "retrieval-first") {
          queries.push(intentQ);
          for (const t of subQs) {
            queries.push(t);
          }
        } else {
          for (const t of subQs) {
            queries.push(t);
          }
          queries.push(intentQ);
        }
        let hits = [];
        const vectorCacheWarnings = [];
        try {
          hits = await runRetrievalForHydrate({
            repoRoot: opts.repoRoot,
            matches: astRead.matches,
            queries,
            topKPerQuery: 8,
            conflictRegions: conflictArt.conflict_regions,
            retrievalBackend: effRetrievalBackend,
            env: opts.env,
            fetchImpl: opts.fetchImpl,
            vectorCachePath: opts.vectorCachePath.trim() || void 0,
            vectorCacheMode: opts.vectorCacheMode.trim() || void 0,
            vectorCacheDiagnostics: {
              ruleset_hash: rulesetHash || void 0,
              repo_head: repoHead || void 0
            },
            vectorCacheWarningsOut: vectorCacheWarnings
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push({
            code: "retrieval_failed",
            message: msg.slice(0, 500)
          });
          if (exitCode === types_1.EXIT_OK) {
            exitCode = types_1.EXIT_PARTIAL;
          }
        }
        for (const w of vectorCacheWarnings) {
          warnings.push({ code: w.code, message: w.message });
        }
        if (effRetrievalBackend === "chroma" && !(opts.env.TONIC_CHROMA_URL ?? "").trim()) {
          warnings.push({
            code: "retrieval_chroma_misconfigured",
            message: "retrieval_backend chroma but TONIC_CHROMA_URL unset"
          });
        }
        const hybridRe = (opts.retrievalHybridRegex || opts.env.TONIC_RETRIEVAL_HYBRID_REGEX || "").trim() || void 0;
        const hybridSym = (opts.retrievalSymbolBoost || opts.env.TONIC_RETRIEVAL_SYMBOL || "").trim() || void 0;
        if (hybridRe || hybridSym) {
          hits = applyRetrievalHybridStage({
            denseHits: hits,
            regexPattern: hybridRe,
            symbolFilter: hybridSym
          });
        }
        retrievalHitsForIntent.push(...hits);
        const retrievalBody = hits.length > 0 ? { schema: "tonic-retrieval-hydration", version: "1", hits } : buildEmptyRetrievalArtifact();
        if (hits.length === 0) {
          warnings.push({
            code: "retrieval_empty",
            message: "retrieval enabled but produced no hits (no indexable chunks or matches)"
          });
          if (exitCode === types_1.EXIT_OK) {
            exitCode = types_1.EXIT_PARTIAL;
          }
        }
        (0, artifact_1.writeUtf8Json)(p.retrieval, retrievalBody);
        retrievalPath = p.retrieval.replace(/\\/g, "/");
        pushStage({
          id: "retrieval",
          status: hits.length === 0 ? "partial" : "ok",
          artifact_path: retrievalPath,
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (loadedPrior?.resolved.retrieval && fs2.existsSync(loadedPrior.resolved.retrieval)) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        try {
          const raw = fs2.readFileSync(loadedPrior.resolved.retrieval, "utf8");
          const body = JSON.parse(raw);
          const hits = Array.isArray(body.hits) ? body.hits : [];
          retrievalHitsForIntent.push(...hits);
          fs2.writeFileSync(p.retrieval, raw, "utf8");
          retrievalPath = p.retrieval.replace(/\\/g, "/");
          warnings.push({
            code: "prior_run_retrieval_chained",
            message: "Reused retrieval-hydration artifact paths from --prior-run (retrieval not enabled on this run)."
          });
          pushStage({
            id: "retrieval",
            status: hits.length === 0 ? "partial" : "ok",
            artifact_path: retrievalPath,
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push({ code: "prior_run_retrieval_chain_failed", message: msg.slice(0, 400) });
          const st2 = (/* @__PURE__ */ new Date()).toISOString();
          pushStage({
            id: "retrieval",
            status: "skipped",
            artifact_path: null,
            started_at: st2,
            finished_at: st2
          });
        }
      } else {
        const stSkip = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id: "retrieval",
          status: "skipped",
          artifact_path: null,
          started_at: stSkip,
          finished_at: stSkip
        });
      }
      if ((opts.env.TONIC_POST_RETRIEVAL_REFINEMENT ?? "").trim() === "1" && retrievalHitsForIntent.length > 0 && cfg.questionMode === "improver" && questionArt) {
        const stPr = (/* @__PURE__ */ new Date()).toISOString();
        const retrievalJson = JSON.stringify(retrievalHitsForIntent.slice(0, 20).map((h) => ({
          chunk_id: h.chunk_id,
          score: h.score,
          metadata: h.metadata,
          text: (h.text ?? "").slice(0, 400)
        })), null, 2);
        const pr = await (0, questionRefinement_1.runPostRetrievalQuestionRefinement)({
          config: cfg,
          leftIntent: questionArt.refined_left_intent ?? intentLeft,
          rightIntent: questionArt.refined_right_intent ?? intentRight,
          conflictRegionsJson: conflictJson,
          repoStructureExcerpt: repoExcerpt,
          retrievalHitsJson: retrievalJson,
          userQuery: opts.userQuery,
          followUp: opts.followUp,
          env: opts.env,
          fetchImpl: opts.fetchImpl
        });
        if (pr.kind === "fail") {
          warnings.push({ code: "post_retrieval_refinement", message: pr.message });
          pushStage({
            id: "question_refinement_post_retrieval",
            status: "failed",
            started_at: stPr,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } else {
          if (pr.warning) {
            warnings.push({ code: "llm_skipped", message: pr.warning });
            exitCode = types_1.EXIT_PARTIAL;
          }
          postRetrievalArt = pr.artifact;
          (0, questionRefinement_1.writePostRetrievalRefinement)(p.questionRefinementPostRetrieval, postRetrievalArt);
          questionRefinementChain.push({
            pass_id: "post_retrieval",
            path: p.questionRefinementPostRetrieval.replace(/\\/g, "/")
          });
          if (!pr.skippedLlm && postRetrievalArt.refined_left_intent && postRetrievalArt.refined_right_intent && questionArt) {
            questionArt = {
              ...questionArt,
              refined_left_intent: postRetrievalArt.refined_left_intent,
              refined_right_intent: postRetrievalArt.refined_right_intent,
              merge_goals: postRetrievalArt.merge_goals ?? questionArt.merge_goals,
              assumptions: postRetrievalArt.assumptions ?? questionArt.assumptions
            };
            (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinement, questionArt);
            if (wroteQuestionRefinementPass2) {
              (0, questionRefinement_1.writeQuestionRefinement)(p.questionRefinementPass2, questionArt);
            }
          }
          pushStage({
            id: "question_refinement_post_retrieval",
            status: pr.skippedLlm ? "partial" : "ok",
            artifact_path: p.questionRefinementPostRetrieval.replace(/\\/g, "/"),
            started_at: stPr,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
      intentLeft = questionArt?.refined_left_intent ?? bootArtifact.left_intent;
      intentRight = questionArt?.refined_right_intent ?? bootArtifact.right_intent;
      let codeWalkTracePath = null;
      if (px < hydrationPhase_1.HYDRATE_PHASE_LEVEL.code_walk) {
        const stSkip = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id: "code_walk",
          status: "skipped",
          artifact_path: null,
          started_at: stSkip,
          finished_at: stSkip
        });
      } else if (opts.enableCodeWalk) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        const { buildBatchCodeWalkTrace, enrichCodeWalkTraceWithLlmReflection } = await Promise.resolve().then(() => __importStar(require_dist()));
        let trace = buildBatchCodeWalkTrace({
          retrievalHits: retrievalHitsForIntent,
          conflictRegionCount: conflictArt.conflict_regions.length,
          astMatchCount: astRead.matches.length
        });
        if (opts.enableCodeWalkAgent) {
          trace = await enrichCodeWalkTraceWithLlmReflection(trace, {
            env: opts.env,
            fetchImpl: opts.fetchImpl,
            leftIntent: intentLeft,
            rightIntent: intentRight,
            retrievalHits: retrievalHitsForIntent
          });
        }
        if (opts.enableCodeWalkSearchAgent && retrievalHitsForIntent.length > 0) {
          const { createMemoryVectorIndex, indexAstChunks, resolveEmbeddingProvider, runCodeSearchAgentTurns } = await Promise.resolve().then(() => __importStar(require_dist()));
          const apiKey = (opts.env.OPENAI_API_KEY ?? opts.env.TONIC_OPENAI_API_KEY ?? "").trim();
          const baseUrl = (opts.llmBaseUrl || opts.env.TONIC_LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
          const model = (opts.llmModel || opts.env.TONIC_LLM_MODEL || "gpt-4o-mini").trim();
          const baseLower = baseUrl.toLowerCase();
          const llmLocalhost = baseLower.includes("127.0.0.1") || baseLower.includes("localhost") || baseLower.includes("0.0.0.0");
          const allowDummyKey = opts.env.TONIC_LLM_ALLOW_DUMMY_KEY?.trim() === "1";
          const canRunAgentWithKey = Boolean(apiKey) || llmLocalhost || allowDummyKey;
          if (!canRunAgentWithKey) {
            trace = {
              ...trace,
              steps: [
                ...trace.steps,
                {
                  tool: "code_search_agent",
                  outcome: {
                    insights: [
                      "Code-search agent skipped: set OPENAI_API_KEY, or point --llm-base-url at localhost/127.0.0.1, or set TONIC_LLM_ALLOW_DUMMY_KEY=1 for a private OpenAI-compatible server."
                    ],
                    mode: "skipped_no_credentials"
                  }
                }
              ]
            };
          } else {
            const embedder = resolveEmbeddingProvider(opts.env);
            const index = createMemoryVectorIndex();
            await indexAstChunks(opts.repoRoot, astRead.matches, index, embedder);
            const key = apiKey || "dummy";
            const agentSteps = await runCodeSearchAgentTurns({
              session: {
                repoRoot: opts.repoRoot,
                matches: astRead.matches,
                index,
                embedder
              },
              maxTurns: Math.min(6, parseInt(opts.env.TONIC_CODE_SEARCH_MAX_TURNS ?? "3", 10) || 3),
              model,
              baseUrl,
              apiKey: key,
              fetchImpl: opts.fetchImpl,
              seedQuery: `${intentLeft} ${intentRight}`.slice(0, 400)
            });
            trace = {
              ...trace,
              steps: [...trace.steps, ...agentSteps.steps]
            };
          }
        }
        (0, artifact_1.writeUtf8Json)(p.codeWalk, trace);
        codeWalkTracePath = p.codeWalk.replace(/\\/g, "/");
        pushStage({
          id: "code_walk",
          status: "ok",
          artifact_path: codeWalkTracePath,
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (loadedPrior?.resolved.code_walk && fs2.existsSync(loadedPrior.resolved.code_walk)) {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        try {
          const raw = fs2.readFileSync(loadedPrior.resolved.code_walk, "utf8");
          fs2.writeFileSync(p.codeWalk, raw, "utf8");
          codeWalkTracePath = p.codeWalk.replace(/\\/g, "/");
          warnings.push({
            code: "prior_run_code_walk_chained",
            message: "Reused code-walk trace from --prior-run (code-walk not enabled on this run)."
          });
          pushStage({
            id: "code_walk",
            status: "ok",
            artifact_path: codeWalkTracePath,
            started_at: st,
            finished_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push({ code: "prior_run_code_walk_chain_failed", message: msg.slice(0, 400) });
          const st2 = (/* @__PURE__ */ new Date()).toISOString();
          pushStage({
            id: "code_walk",
            status: "skipped",
            artifact_path: null,
            started_at: st2,
            finished_at: st2
          });
        }
      } else {
        const stSkip = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id: "code_walk",
          status: "skipped",
          artifact_path: null,
          started_at: stSkip,
          finished_at: stSkip
        });
      }
      const intent = (0, buildIntentHydration_1.buildIntentHydration)({
        bootstrap: bootArtifact,
        refinement: questionArt,
        conflicts: conflictArt,
        ast: astRead,
        astPath: p.astHydration,
        conflictPath: p.conflictContext,
        retrieval: retrievalPath && retrievalHitsForIntent.length > 0 ? { artifactPath: retrievalPath, hits: retrievalHitsForIntent } : void 0,
        codeWalkTracePath: codeWalkTracePath ?? void 0
      });
      (0, buildIntentHydration_1.writeIntentHydration)(p.intentHydration, intent);
      {
        const st = (/* @__PURE__ */ new Date()).toISOString();
        pushStage({
          id: "intent_bundle",
          status: "ok",
          artifact_path: p.intentHydration.replace(/\\/g, "/"),
          started_at: st,
          finished_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      const status = exitCode === types_1.EXIT_OK ? "ok" : exitCode === types_1.EXIT_PARTIAL ? "partial" : "failed";
      (0, artifact_1.writeUtf8Json)(p.run, (0, artifact_1.buildRunJson)({
        runId,
        status,
        exitCode,
        errors,
        warnings,
        inputs: runInputs(),
        timingMs: Date.now() - t0,
        astEvidencePath: p.astHydration.replace(/\\/g, "/"),
        pipeline: {
          stages,
          source_config: mkSourceConfig()
        }
      }));
      const runObj = JSON.parse(fs2.readFileSync(p.run, "utf8"));
      runObj.intent_bootstrap_path = p.intentBootstrap.replace(/\\/g, "/");
      runObj.question_refinement_path = p.questionRefinement.replace(/\\/g, "/");
      runObj.conflict_context_path = p.conflictContext.replace(/\\/g, "/");
      runObj.repo_structure_path = p.repoStructure.replace(/\\/g, "/");
      runObj.intent_hydration_path = p.intentHydration.replace(/\\/g, "/");
      runObj.retrieval_path = retrievalPath;
      runObj.code_walk_trace_path = codeWalkTracePath;
      runObj.prior_run_path = opts.priorRunPath ? opts.priorRunPath.replace(/\\/g, "/") : null;
      if (questionRefinementChain.length > 0) {
        runObj.question_refinement_chain = questionRefinementChain;
      }
      if (postRetrievalArt) {
        runObj.question_refinement_post_retrieval_path = p.questionRefinementPostRetrieval.replace(/\\/g, "/");
      }
      (0, artifact_1.writeUtf8Json)(p.run, runObj);
      return exitCode;
    }
  }
});

// ../../packages/tonic-core/dist/hydration/hydrateCommand.js
var require_hydrateCommand = __commonJS({
  "../../packages/tonic-core/dist/hydration/hydrateCommand.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseHydrateArgv = parseHydrateArgv;
    exports2.runHydrationPipelineFromArgv = runHydrationPipelineFromArgv;
    var path2 = __importStar(require("node:path"));
    var hydrationPhase_1 = require_hydrationPhase();
    var pipeline_1 = require_pipeline();
    function getArg(argv, names, def) {
      for (const n of names) {
        const i = argv.indexOf(n);
        if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) {
          return argv[i + 1];
        }
      }
      return def;
    }
    function hasFlag(argv, names) {
      return names.some((n) => argv.includes(n));
    }
    function parseHydrateArgv(argv) {
      const repo = path2.resolve(getArg(argv, ["--repo", "-R"], "."));
      const outDir = path2.resolve(getArg(argv, ["--out-dir"], path2.join(repo, ".tonic", "hydrate-out")));
      const hydrationConfigPath = getArg(argv, ["--hydration-config"], "");
      const leftIntent = getArg(argv, ["--left-intent"], "");
      const rightIntent = getArg(argv, ["--right-intent"], "");
      const intentPair = getArg(argv, ["--intent-pair"], "");
      const intentProfile = getArg(argv, ["--intent-profile"], "");
      const qm = getArg(argv, ["--question-mode"], "").toLowerCase();
      let questionModeCli;
      if (qm === "off" || qm === "improver" || qm === "subquestions") {
        questionModeCli = qm;
      }
      const strictLlm = hasFlag(argv, ["--strict-llm"]);
      const llmModel = getArg(argv, ["--llm-model"], "");
      const llmBaseUrl = getArg(argv, ["--llm-base-url"], "");
      const openaiApiKeyEnv = getArg(argv, ["--openai-api-key-env"], "");
      const enableRetrieval = hasFlag(argv, ["--enable-retrieval", "--source-retrieval"]);
      const rb = getArg(argv, ["--retrieval-backend"], "memory").toLowerCase();
      const retrievalBackend = rb === "chroma" ? "chroma" : "memory";
      const retrievalHybridRegex = getArg(argv, ["--retrieval-hybrid-regex"], "");
      const retrievalSymbolBoost = getArg(argv, ["--retrieval-symbol-boost"], "");
      const enableCodeWalk = hasFlag(argv, ["--enable-code-walk", "--source-code-walk"]);
      const enableCodeWalkAgent = hasFlag(argv, ["--enable-code-walk-agent"]);
      const enableCodeWalkSearchAgent = hasFlag(argv, ["--enable-code-walk-search-agent"]);
      const embeddingBackendFlag = getArg(argv, ["--embedding-backend"], "");
      const priorRunPath = getArg(argv, ["--prior-run"], "");
      const vectorCachePath = getArg(argv, ["--vector-cache-path"], "");
      const vectorCacheMode = getArg(argv, ["--vector-cache-mode"], "");
      const userQuery = getArg(argv, ["--user-query"], "");
      const followUp = getArg(argv, ["--follow-up"], "");
      const phaseParsed = (0, hydrationPhase_1.parseHydratePhase)(getArg(argv, ["--phase"], ""));
      if (!phaseParsed.ok) {
        return { ok: false, message: phaseParsed.message };
      }
      const forcePriorRun = hasFlag(argv, ["--force-prior"]);
      const spRaw = getArg(argv, ["--source-priority"], "").trim().toLowerCase();
      let sourcePriority = "default";
      if (!spRaw || spRaw === "default") {
        sourcePriority = "default";
      } else if (spRaw === "ast-first") {
        sourcePriority = "ast-first";
      } else if (spRaw === "retrieval-first") {
        sourcePriority = "retrieval-first";
      } else {
        return {
          ok: false,
          message: `merge-tonic hydrate: unknown --source-priority "${spRaw}". Use default | ast-first | retrieval-first.`
        };
      }
      const hydrateFlags = /* @__PURE__ */ new Set([
        "--repo",
        "-R",
        "--out-dir",
        "--hydration-config",
        "--left-intent",
        "--right-intent",
        "--intent-pair",
        "--intent-profile",
        "--question-mode",
        "--strict-llm",
        "--llm-model",
        "--llm-base-url",
        "--openai-api-key-env",
        "--enable-retrieval",
        "--source-retrieval",
        "--enable-code-walk",
        "--source-code-walk",
        "--prior-run",
        "--user-query",
        "--follow-up",
        "--enable-code-walk-agent",
        "--enable-code-walk-search-agent",
        "--retrieval-backend",
        "--retrieval-hybrid-regex",
        "--retrieval-symbol-boost",
        "--embedding-backend",
        "--phase",
        "--force-prior",
        "--source-priority",
        "--vector-cache-path",
        "--vector-cache-mode"
      ]);
      const astArgv = [];
      for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--") {
          astArgv.push(...argv.slice(i));
          break;
        }
        if (hydrateFlags.has(a)) {
          if (a !== "--strict-llm" && a !== "--enable-retrieval" && a !== "--source-retrieval" && a !== "--enable-code-walk" && a !== "--source-code-walk" && a !== "--enable-code-walk-agent" && a !== "--enable-code-walk-search-agent" && a !== "--force-prior") {
            if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
              i++;
            }
          }
          continue;
        }
        astArgv.push(a);
      }
      const env3 = { ...process.env };
      if (embeddingBackendFlag.trim()) {
        env3.TONIC_EMBEDDING_BACKEND = embeddingBackendFlag.trim();
      }
      if (vectorCachePath.trim()) {
        env3.TONIC_VECTOR_CACHE_PATH = vectorCachePath.trim();
      }
      if (vectorCacheMode.trim()) {
        env3.TONIC_VECTOR_CACHE_MODE = vectorCacheMode.trim();
      }
      return {
        ok: true,
        opts: {
          repoRoot: repo,
          outDir,
          hydrationConfigPath,
          leftIntent,
          rightIntent,
          intentPair,
          intentProfile,
          questionModeCli,
          strictLlm,
          llmModel,
          llmBaseUrl,
          openaiApiKeyEnv,
          enableRetrieval,
          retrievalBackend,
          retrievalHybridRegex,
          retrievalSymbolBoost,
          enableCodeWalk,
          enableCodeWalkAgent,
          enableCodeWalkSearchAgent,
          userQuery,
          followUp,
          priorRunPath,
          hydratePhaseMax: phaseParsed.max,
          forcePriorRun,
          sourcePriority,
          vectorCachePath,
          vectorCacheMode,
          astArgv,
          env: env3
        }
      };
    }
    async function runHydrationPipelineFromArgv(argv) {
      const parsed = parseHydrateArgv(argv);
      if (!parsed.ok) {
        console.error(parsed.message);
        return 11;
      }
      return (0, pipeline_1.runHydrationPipeline)(parsed.opts);
    }
  }
});

// ../../packages/tonic-core/dist/weaveGit/hashutil.js
var require_hashutil = __commonJS({
  "../../packages/tonic-core/dist/weaveGit/hashutil.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.normalizeLf = normalizeLf;
    exports2.canonicalTextLines = canonicalTextLines;
    exports2.sha256HexUtf8 = sha256HexUtf8;
    exports2.sha256HexBytes = sha256HexBytes;
    var node_crypto_1 = require("node:crypto");
    function normalizeLf(text) {
      return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    }
    function canonicalTextLines(text) {
      const norm = normalizeLf(text);
      const lines = norm.length ? norm.split("\n") : [];
      if (lines.length && lines[lines.length - 1] === "") {
        lines.pop();
      }
      return lines;
    }
    function sha256HexUtf8(text) {
      return (0, node_crypto_1.createHash)("sha256").update(text, "utf8").digest("hex");
    }
    function sha256HexBytes(data) {
      return (0, node_crypto_1.createHash)("sha256").update(data).digest("hex");
    }
  }
});

// ../../packages/tonic-core/dist/weaveGit/manifest.js
var require_manifest = __commonJS({
  "../../packages/tonic-core/dist/weaveGit/manifest.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseManifestJson = parseManifestJson;
    exports2.serializeManifestJson = serializeManifestJson;
    exports2.pathEntryForFile = pathEntryForFile;
    var hashutil_1 = require_hashutil();
    function assertManifest(cond, msg) {
      if (!cond) {
        throw new Error(msg);
      }
    }
    function parseManifestJson(raw) {
      const data = JSON.parse(raw);
      assertManifest(typeof data === "object" && data !== null, "manifest root must be object");
      const o = data;
      assertManifest(o.schema === "tonic-git-manifest", "manifest.schema must be tonic-git-manifest");
      assertManifest(o.version === "1", "manifest.version must be 1");
      assertManifest(typeof o.commit === "string" && o.commit.length > 0, "manifest.commit required");
      const paths = o.paths;
      assertManifest(typeof paths === "object" && paths !== null, "manifest.paths must be object");
      for (const [rel, row] of Object.entries(paths)) {
        assertManifest(typeof row === "object" && row !== null, `path ${rel}: entry must be object`);
        const pe = row;
        for (const k of ["text_blob_sha", "weave_serialized_sha", "weave_format_version", "diff_engine_id"]) {
          assertManifest(typeof pe[k] === "string" && pe[k].length > 0, `path ${rel}: missing ${k}`);
        }
        const pw = pe.parent_weave_shas;
        if (pw !== void 0 && pw !== null) {
          assertManifest(Array.isArray(pw), `path ${rel}: parent_weave_shas must be array`);
          for (const x of pw) {
            assertManifest(typeof x === "string" && x.length > 0, `path ${rel}: parent weave sha must be non-empty string`);
          }
        }
      }
      return data;
    }
    function sortJsonKeysDeep(value) {
      if (value === null || typeof value !== "object") {
        return value;
      }
      if (Array.isArray(value)) {
        return value.map(sortJsonKeysDeep);
      }
      const o = value;
      const keys = Object.keys(o).sort();
      const out = {};
      for (const k of keys) {
        out[k] = sortJsonKeysDeep(o[k]);
      }
      return out;
    }
    function serializeManifestJson(manifest, indent = 2) {
      const sorted = sortJsonKeysDeep(manifest);
      return JSON.stringify(sorted, null, indent) + (indent ? "\n" : "");
    }
    function pathEntryForFile(params) {
      const norm = (0, hashutil_1.normalizeLf)(params.textCanonical);
      const textSha = (0, hashutil_1.sha256HexUtf8)(norm);
      const weaveBytes = Buffer.from(params.serializedWeave, "utf8");
      const weaveSha = (0, hashutil_1.sha256HexBytes)(weaveBytes);
      const entry = {
        text_blob_sha: textSha,
        weave_serialized_sha: weaveSha,
        weave_format_version: params.weaveFormatVersion,
        diff_engine_id: params.diffEngineId
      };
      if (params.parentWeaveShas !== void 0) {
        entry.parent_weave_shas = params.parentWeaveShas;
      }
      if (params.degraded !== void 0) {
        entry.degraded = params.degraded;
      }
      if (params.squash !== void 0) {
        entry.squash = params.squash;
      }
      return [params.relPath, entry];
    }
  }
});

// ../../packages/tonic-core/dist/weaveGit/gitStaging.js
var require_gitStaging = __commonJS({
  "../../packages/tonic-core/dist/weaveGit/gitStaging.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.gitStagedPaths = gitStagedPaths;
    var node_child_process_1 = require("node:child_process");
    function gitStagedPaths(repoRoot) {
      const r = (0, node_child_process_1.spawnSync)("git", ["diff", "--cached", "--name-only", "-z"], {
        cwd: repoRoot,
        encoding: "utf8"
      });
      if (r.status !== 0) {
        return /* @__PURE__ */ new Set();
      }
      const raw = r.stdout ?? "";
      if (!raw) {
        return /* @__PURE__ */ new Set();
      }
      return new Set(raw.split("\0").filter(Boolean).map((p) => p.replace(/\\/g, "/")));
    }
  }
});

// ../../packages/tonic-core/dist/weaveGit/lfs.js
var require_lfs = __commonJS({
  "../../packages/tonic-core/dist/weaveGit/lfs.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isLfsPointer = isLfsPointer;
    exports2.findLfsPointersUnder = findLfsPointersUnder;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var LFS_POINTER_PREFIX = Buffer.from("version https://git-lfs.github.com/spec/v1");
    function isLfsPointer(data) {
      return data.length >= LFS_POINTER_PREFIX.length && LFS_POINTER_PREFIX.equals(data.subarray(0, LFS_POINTER_PREFIX.length));
    }
    function findLfsPointersUnder(root) {
      const out = [];
      if (!fs2.existsSync(root) || !fs2.statSync(root).isDirectory()) {
        return out;
      }
      const walk = (dir) => {
        let entries;
        try {
          entries = fs2.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const ent of entries) {
          const full = path2.join(dir, ent.name);
          if (ent.isDirectory()) {
            walk(full);
          } else if (ent.isFile()) {
            let head;
            try {
              const fd = fs2.openSync(full, "r");
              const buf = Buffer.alloc(64);
              const n = fs2.readSync(fd, buf, 0, 64, 0);
              fs2.closeSync(fd);
              head = buf.subarray(0, n);
            } catch {
              continue;
            }
            if (isLfsPointer(head)) {
              out.push(full);
            }
          }
        }
      };
      walk(root);
      return out;
    }
  }
});

// ../../packages/tonic-core/dist/weaveGit/verify.js
var require_verify = __commonJS({
  "../../packages/tonic-core/dist/weaveGit/verify.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || /* @__PURE__ */ (function() {
      var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function(o2) {
          var ar = [];
          for (var k in o2) if (Object.prototype.hasOwnProperty.call(o2, k)) ar[ar.length] = k;
          return ar;
        };
        return ownKeys(o);
      };
      return function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) {
          for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        }
        __setModuleDefault(result, mod);
        return result;
      };
    })();
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DEFAULT_WEAVE_ROOT = void 0;
    exports2.verifyReportStatus = verifyReportStatus;
    exports2.verifyReportDict = verifyReportDict;
    exports2.weaveBlobPath = weaveBlobPath;
    exports2.verifyPathLocal = verifyPathLocal;
    exports2.verifyManifest = verifyManifest;
    exports2.applyLfsPointerChecks = applyLfsPointerChecks;
    exports2.verifyStaged = verifyStaged;
    exports2.verifyReportJson = verifyReportJson;
    var fs2 = __importStar(require("node:fs"));
    var path2 = __importStar(require("node:path"));
    var core_1 = require_core();
    var state_1 = require_state();
    var hashutil_1 = require_hashutil();
    var manifest_1 = require_manifest();
    var gitStaging_1 = require_gitStaging();
    var lfs_1 = require_lfs();
    exports2.DEFAULT_WEAVE_ROOT = path2.join(".tonic", "weave");
    function verifyReportStatus(ok, strict, errorCount) {
      if (ok) {
        return "ok";
      }
      if (strict || errorCount === 0) {
        return "failed";
      }
      return "degraded";
    }
    function verifyReportDict(repoRoot, vr) {
      return {
        schema: "tonic-weave-verify-report",
        version: "1",
        status: verifyReportStatus(vr.ok, vr.strict, vr.errors.length),
        strict: vr.strict,
        repo_root: path2.resolve(repoRoot),
        checks: vr.checks,
        errors: vr.errors
      };
    }
    function weaveBlobPath(weaveRoot, weaveSerializedSha) {
      return path2.join(weaveRoot, "blobs", weaveSerializedSha);
    }
    function verifyPathLocal(repoRoot, relPath, entry, weaveRoot) {
      const errs = [];
      const p = path2.join(repoRoot, relPath);
      if (!fs2.existsSync(p) || !fs2.statSync(p).isFile()) {
        errs.push(`${relPath}: missing file`);
        return errs;
      }
      const raw = fs2.readFileSync(p, "utf8");
      const norm = (0, hashutil_1.normalizeLf)(raw);
      const lines = norm.length ? norm.split("\n") : [];
      if (lines.length && lines[lines.length - 1] === "") {
        lines.pop();
      }
      const textSha = (0, hashutil_1.sha256HexUtf8)(norm);
      const wantText = entry.text_blob_sha;
      if (typeof wantText !== "string" || textSha !== wantText) {
        errs.push(`${relPath}: text_blob_sha mismatch (got ${textSha})`);
      }
      const wss = entry.weave_serialized_sha;
      if (typeof wss !== "string") {
        errs.push(`${relPath}: invalid weave_serialized_sha in manifest`);
        return errs;
      }
      const blob = weaveBlobPath(weaveRoot, wss);
      if (!fs2.existsSync(blob)) {
        errs.push(`${relPath}: missing weave blob at ${blob}`);
        return errs;
      }
      const weaveBytes = fs2.readFileSync(blob);
      if ((0, hashutil_1.sha256HexBytes)(weaveBytes) !== wss) {
        errs.push(`${relPath}: weave blob hash mismatch`);
        return errs;
      }
      let stateS;
      try {
        stateS = weaveBytes.toString("utf8");
        (0, state_1.deserializeState)(stateS);
      } catch (e) {
        errs.push(`${relPath}: deserialize_state failed: ${e}`);
        return errs;
      }
      const roundtrip = Buffer.from((0, state_1.serializeState)((0, state_1.deserializeState)(stateS)), "utf8");
      if ((0, hashutil_1.sha256HexBytes)(roundtrip) !== wss) {
        errs.push(`${relPath}: weave round-trip sha mismatch`);
      }
      let cl;
      try {
        cl = (0, core_1.currentLines)(stateS);
      } catch (e) {
        errs.push(`${relPath}: current_lines failed: ${e}`);
        return errs;
      }
      if (cl.join("\n") !== lines.join("\n")) {
        errs.push(`${relPath}: working tree text does not match weave current_lines`);
      }
      return errs;
    }
    function verifyManifest(repoRoot, manifest, options = {}) {
      const wr = options.weaveRoot ?? path2.join(repoRoot, exports2.DEFAULT_WEAVE_ROOT);
      const checks = [];
      const errors = [];
      const strict = options.strict ?? false;
      const only = options.onlyPaths ?? null;
      const paths = manifest.paths;
      for (const [rel, ent] of Object.entries(paths)) {
        if (only !== null && !only.has(rel)) {
          continue;
        }
        if (typeof ent !== "object" || ent === null) {
          errors.push({ code: "bad_entry", message: `${rel}: not an object`, path: rel });
          continue;
        }
        const pe = verifyPathLocal(repoRoot, rel, ent, wr);
        const ok2 = pe.length === 0;
        checks.push({ id: `path:${rel}`, ok: ok2, message: pe.join("; ") || "", path: rel });
        for (const m of pe) {
          errors.push({ code: "verify_path", message: m, path: rel });
        }
      }
      if (strict) {
        for (const [rel, ent] of Object.entries(paths)) {
          if (only !== null && !only.has(rel)) {
            continue;
          }
          if (typeof ent === "object" && ent !== null && ent.degraded === true) {
            const msg = `${rel}: degraded manifest row not allowed in strict mode`;
            errors.push({ code: "strict_degraded", message: msg, path: rel });
            checks.push({ id: `strict:${rel}`, ok: false, message: msg, path: rel });
          }
        }
      }
      const ok = errors.length === 0;
      const status = verifyReportStatus(ok, strict, errors.length);
      return { ok, status, strict, errors, checks };
    }
    function applyLfsPointerChecks(vr, repoRoot, opts) {
      if (!opts.checkLfs && !vr.strict) {
        return vr;
      }
      const objs = path2.join(repoRoot, ".tonic", "objects");
      const pointers = (0, lfs_1.findLfsPointersUnder)(objs);
      if (!pointers.length) {
        return vr;
      }
      const errors = [...vr.errors];
      const checks = [...vr.checks];
      for (const p of pointers) {
        errors.push({ code: "lfs_pointer", message: `LFS pointer not smudged: ${p}`, path: p });
        checks.push({ id: `lfs:${p}`, ok: false, message: "pointer present", path: p });
      }
      const ok = false;
      const status = verifyReportStatus(ok, vr.strict, errors.length);
      return { ok, status, strict: vr.strict, errors, checks };
    }
    function verifyStaged(repoRoot, manifestJson, options = {}) {
      const manifest = (0, manifest_1.parseManifestJson)(manifestJson);
      const staged = (0, gitStaging_1.gitStagedPaths)(repoRoot);
      let onlyPaths = null;
      if (staged.size === 0) {
        onlyPaths = null;
      } else {
        const manifestPaths = new Set(Object.keys(manifest.paths));
        const inter = new Set([...manifestPaths].filter((k) => staged.has(k)));
        if (inter.size === 0) {
          const strict = options.strict ?? false;
          return {
            ok: true,
            status: "ok",
            strict,
            checks: [{ id: "staged", ok: true, message: "no staged tonic paths in manifest" }],
            errors: []
          };
        }
        onlyPaths = inter;
      }
      return verifyManifest(repoRoot, manifest, { ...options, onlyPaths });
    }
    function verifyReportJson(repoRoot, manifestJson, opts) {
      const m = (0, manifest_1.parseManifestJson)(manifestJson);
      const vr = verifyManifest(repoRoot, m, opts);
      return JSON.stringify(verifyReportDict(repoRoot, vr), null, 2);
    }
  }
});

// ../../packages/tonic-core/dist/index.js
var require_dist2 = __commonJS({
  "../../packages/tonic-core/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseIntentPair = exports2.saveIntentProfile = exports2.loadIntentProfile = exports2.createDefaultGitAuthorProbe = exports2.parseGitAuthorNameEmail = exports2.humanAliasFromGitStdout = exports2.resolveAuthorAliasForSide = exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT = exports2.DEFAULT_GIT_MERGE_LEFT_INTENT = exports2.gitConflictBlocksToTonicAnnotatedPreview = exports2.gitConflictBlocksToConflictRegions = exports2.hasGitConflictMarkers = exports2.parseGitConflictsWithDiagnostics = exports2.parseGitConflicts = exports2.sanitizeAuthorTagToken = exports2.normalizeConflictLabel = exports2.updateTagInConflictLabel = exports2.removeTagFromConflictLabel = exports2.addTagToConflictLabel = exports2.formatConflictLabel = exports2.parseConflictLabel = exports2.conflictSummary = exports2.parseTonicConflictsWithDiagnostics = exports2.parseTonicConflicts = exports2.WeaveSpliceError = exports2.WeaveExtractError = exports2.spliceWeaveRows = exports2.extractWeaveRows = exports2.WeaveIntrospectError = exports2.visibleRangeToWeaveIndices = exports2.visibleLineCount = exports2.splitWeaveIndexAfterVisible = exports2.inspectRowsJson = exports2.buildVisibleWeaveMaps = exports2.deserializeState = exports2.serializeState = exports2.conflictCode = exports2.showConflicts = exports2.END_MARKER = exports2.conflictStrings = exports2.PEACE = exports2.CONFLICT_DELETED_RIGHT = exports2.CONFLICT_DELETED_LEFT = exports2.CONFLICT_ADDED_BOTH = exports2.CONFLICT_ADDED_RIGHT = exports2.CONFLICT_ADDED_LEFT = exports2.mergeStates = exports2.updateState = exports2.currentLines = exports2.initialState = void 0;
    exports2.isLfsPointer = exports2.findLfsPointersUnder = exports2.DEFAULT_WEAVE_ROOT = exports2.weaveBlobPath = exports2.verifyStaged = exports2.verifyReportStatus = exports2.verifyReportJson = exports2.verifyReportDict = exports2.verifyManifest = exports2.applyLfsPointerChecks = exports2.sha256HexBytes = exports2.sha256HexUtf8 = exports2.normalizeLf = exports2.pathEntryForFile = exports2.serializeManifestJson = exports2.parseManifestJson = exports2.hydrateTonicAnnotatedAuthorIntent = exports2.applyTonicHeuristic = exports2.applyTonicResolutions = exports2.suggestionLineCountOk = exports2.heuristicResolvedLines = exports2.conflictFileFromBlocks = exports2.conflictRegionsToAnnotatedLines = exports2.annotatedToConflictFile = exports2.mergeSnapshots = exports2.runHydrationPipelineFromArgv = exports2.parseHydrateArgv = exports2.runHydrationPipeline = exports2.runAstGrepScan = exports2.runAstGrepHydrateFromArgv = exports2.runAstGrepHydrate = exports2.parseAstGrepHydrateArgv = exports2.EXIT_SCAN_FAILED = exports2.EXIT_PARTIAL = exports2.EXIT_OK = exports2.EXIT_INVALID_ARGS = exports2.EXIT_AST_GREP_MISSING = exports2.DEFAULT_INTENT_PROFILE_PATH = exports2.promptIntentPairInteractive = void 0;
    var core_1 = require_core();
    Object.defineProperty(exports2, "initialState", { enumerable: true, get: function() {
      return core_1.initialState;
    } });
    Object.defineProperty(exports2, "currentLines", { enumerable: true, get: function() {
      return core_1.currentLines;
    } });
    Object.defineProperty(exports2, "updateState", { enumerable: true, get: function() {
      return core_1.updateState;
    } });
    Object.defineProperty(exports2, "mergeStates", { enumerable: true, get: function() {
      return core_1.mergeStates;
    } });
    var conflicts_1 = require_conflicts();
    Object.defineProperty(exports2, "CONFLICT_ADDED_LEFT", { enumerable: true, get: function() {
      return conflicts_1.CONFLICT_ADDED_LEFT;
    } });
    Object.defineProperty(exports2, "CONFLICT_ADDED_RIGHT", { enumerable: true, get: function() {
      return conflicts_1.CONFLICT_ADDED_RIGHT;
    } });
    Object.defineProperty(exports2, "CONFLICT_ADDED_BOTH", { enumerable: true, get: function() {
      return conflicts_1.CONFLICT_ADDED_BOTH;
    } });
    Object.defineProperty(exports2, "CONFLICT_DELETED_LEFT", { enumerable: true, get: function() {
      return conflicts_1.CONFLICT_DELETED_LEFT;
    } });
    Object.defineProperty(exports2, "CONFLICT_DELETED_RIGHT", { enumerable: true, get: function() {
      return conflicts_1.CONFLICT_DELETED_RIGHT;
    } });
    Object.defineProperty(exports2, "PEACE", { enumerable: true, get: function() {
      return conflicts_1.PEACE;
    } });
    Object.defineProperty(exports2, "conflictStrings", { enumerable: true, get: function() {
      return conflicts_1.conflictStrings;
    } });
    Object.defineProperty(exports2, "END_MARKER", { enumerable: true, get: function() {
      return conflicts_1.END_MARKER;
    } });
    Object.defineProperty(exports2, "showConflicts", { enumerable: true, get: function() {
      return conflicts_1.showConflicts;
    } });
    Object.defineProperty(exports2, "conflictCode", { enumerable: true, get: function() {
      return conflicts_1.conflictCode;
    } });
    var state_1 = require_state();
    Object.defineProperty(exports2, "serializeState", { enumerable: true, get: function() {
      return state_1.serializeState;
    } });
    Object.defineProperty(exports2, "deserializeState", { enumerable: true, get: function() {
      return state_1.deserializeState;
    } });
    var weaveIntrospect_1 = require_weaveIntrospect();
    Object.defineProperty(exports2, "buildVisibleWeaveMaps", { enumerable: true, get: function() {
      return weaveIntrospect_1.buildVisibleWeaveMaps;
    } });
    Object.defineProperty(exports2, "inspectRowsJson", { enumerable: true, get: function() {
      return weaveIntrospect_1.inspectRowsJson;
    } });
    Object.defineProperty(exports2, "splitWeaveIndexAfterVisible", { enumerable: true, get: function() {
      return weaveIntrospect_1.splitWeaveIndexAfterVisible;
    } });
    Object.defineProperty(exports2, "visibleLineCount", { enumerable: true, get: function() {
      return weaveIntrospect_1.visibleLineCount;
    } });
    Object.defineProperty(exports2, "visibleRangeToWeaveIndices", { enumerable: true, get: function() {
      return weaveIntrospect_1.visibleRangeToWeaveIndices;
    } });
    Object.defineProperty(exports2, "WeaveIntrospectError", { enumerable: true, get: function() {
      return weaveIntrospect_1.WeaveIntrospectError;
    } });
    var weaveSlice_1 = require_weaveSlice();
    Object.defineProperty(exports2, "extractWeaveRows", { enumerable: true, get: function() {
      return weaveSlice_1.extractWeaveRows;
    } });
    Object.defineProperty(exports2, "spliceWeaveRows", { enumerable: true, get: function() {
      return weaveSlice_1.spliceWeaveRows;
    } });
    Object.defineProperty(exports2, "WeaveExtractError", { enumerable: true, get: function() {
      return weaveSlice_1.WeaveExtractError;
    } });
    Object.defineProperty(exports2, "WeaveSpliceError", { enumerable: true, get: function() {
      return weaveSlice_1.WeaveSpliceError;
    } });
    var conflictParser_1 = require_conflictParser();
    Object.defineProperty(exports2, "parseTonicConflicts", { enumerable: true, get: function() {
      return conflictParser_1.parseTonicConflicts;
    } });
    Object.defineProperty(exports2, "parseTonicConflictsWithDiagnostics", { enumerable: true, get: function() {
      return conflictParser_1.parseTonicConflictsWithDiagnostics;
    } });
    Object.defineProperty(exports2, "conflictSummary", { enumerable: true, get: function() {
      return conflictParser_1.conflictSummary;
    } });
    var markerLabel_1 = require_markerLabel();
    Object.defineProperty(exports2, "parseConflictLabel", { enumerable: true, get: function() {
      return markerLabel_1.parseConflictLabel;
    } });
    Object.defineProperty(exports2, "formatConflictLabel", { enumerable: true, get: function() {
      return markerLabel_1.formatConflictLabel;
    } });
    Object.defineProperty(exports2, "addTagToConflictLabel", { enumerable: true, get: function() {
      return markerLabel_1.addTagToConflictLabel;
    } });
    Object.defineProperty(exports2, "removeTagFromConflictLabel", { enumerable: true, get: function() {
      return markerLabel_1.removeTagFromConflictLabel;
    } });
    Object.defineProperty(exports2, "updateTagInConflictLabel", { enumerable: true, get: function() {
      return markerLabel_1.updateTagInConflictLabel;
    } });
    Object.defineProperty(exports2, "normalizeConflictLabel", { enumerable: true, get: function() {
      return markerLabel_1.normalizeConflictLabel;
    } });
    Object.defineProperty(exports2, "sanitizeAuthorTagToken", { enumerable: true, get: function() {
      return markerLabel_1.sanitizeAuthorTagToken;
    } });
    var gitConflictParser_1 = require_gitConflictParser();
    Object.defineProperty(exports2, "parseGitConflicts", { enumerable: true, get: function() {
      return gitConflictParser_1.parseGitConflicts;
    } });
    Object.defineProperty(exports2, "parseGitConflictsWithDiagnostics", { enumerable: true, get: function() {
      return gitConflictParser_1.parseGitConflictsWithDiagnostics;
    } });
    Object.defineProperty(exports2, "hasGitConflictMarkers", { enumerable: true, get: function() {
      return gitConflictParser_1.hasGitConflictMarkers;
    } });
    var markerInterop_1 = require_markerInterop();
    Object.defineProperty(exports2, "gitConflictBlocksToConflictRegions", { enumerable: true, get: function() {
      return markerInterop_1.gitConflictBlocksToConflictRegions;
    } });
    Object.defineProperty(exports2, "gitConflictBlocksToTonicAnnotatedPreview", { enumerable: true, get: function() {
      return markerInterop_1.gitConflictBlocksToTonicAnnotatedPreview;
    } });
    Object.defineProperty(exports2, "DEFAULT_GIT_MERGE_LEFT_INTENT", { enumerable: true, get: function() {
      return markerInterop_1.DEFAULT_GIT_MERGE_LEFT_INTENT;
    } });
    Object.defineProperty(exports2, "DEFAULT_GIT_MERGE_RIGHT_INTENT", { enumerable: true, get: function() {
      return markerInterop_1.DEFAULT_GIT_MERGE_RIGHT_INTENT;
    } });
    var authorAliasResolver_1 = require_authorAliasResolver();
    Object.defineProperty(exports2, "resolveAuthorAliasForSide", { enumerable: true, get: function() {
      return authorAliasResolver_1.resolveAuthorAliasForSide;
    } });
    Object.defineProperty(exports2, "humanAliasFromGitStdout", { enumerable: true, get: function() {
      return authorAliasResolver_1.humanAliasFromGitStdout;
    } });
    Object.defineProperty(exports2, "parseGitAuthorNameEmail", { enumerable: true, get: function() {
      return authorAliasResolver_1.parseGitAuthorNameEmail;
    } });
    Object.defineProperty(exports2, "createDefaultGitAuthorProbe", { enumerable: true, get: function() {
      return authorAliasResolver_1.createDefaultGitAuthorProbe;
    } });
    var intentInteractive_1 = require_intentInteractive();
    Object.defineProperty(exports2, "loadIntentProfile", { enumerable: true, get: function() {
      return intentInteractive_1.loadIntentProfile;
    } });
    Object.defineProperty(exports2, "saveIntentProfile", { enumerable: true, get: function() {
      return intentInteractive_1.saveIntentProfile;
    } });
    Object.defineProperty(exports2, "parseIntentPair", { enumerable: true, get: function() {
      return intentInteractive_1.parseIntentPair;
    } });
    Object.defineProperty(exports2, "promptIntentPairInteractive", { enumerable: true, get: function() {
      return intentInteractive_1.promptIntentPairInteractive;
    } });
    Object.defineProperty(exports2, "DEFAULT_INTENT_PROFILE_PATH", { enumerable: true, get: function() {
      return intentInteractive_1.DEFAULT_INTENT_PROFILE_PATH;
    } });
    var types_1 = require_types();
    Object.defineProperty(exports2, "EXIT_AST_GREP_MISSING", { enumerable: true, get: function() {
      return types_1.EXIT_AST_GREP_MISSING;
    } });
    Object.defineProperty(exports2, "EXIT_INVALID_ARGS", { enumerable: true, get: function() {
      return types_1.EXIT_INVALID_ARGS;
    } });
    Object.defineProperty(exports2, "EXIT_OK", { enumerable: true, get: function() {
      return types_1.EXIT_OK;
    } });
    Object.defineProperty(exports2, "EXIT_PARTIAL", { enumerable: true, get: function() {
      return types_1.EXIT_PARTIAL;
    } });
    Object.defineProperty(exports2, "EXIT_SCAN_FAILED", { enumerable: true, get: function() {
      return types_1.EXIT_SCAN_FAILED;
    } });
    var command_1 = require_command();
    Object.defineProperty(exports2, "parseAstGrepHydrateArgv", { enumerable: true, get: function() {
      return command_1.parseAstGrepHydrateArgv;
    } });
    Object.defineProperty(exports2, "runAstGrepHydrate", { enumerable: true, get: function() {
      return command_1.runAstGrepHydrate;
    } });
    Object.defineProperty(exports2, "runAstGrepHydrateFromArgv", { enumerable: true, get: function() {
      return command_1.runAstGrepHydrateFromArgv;
    } });
    var runner_1 = require_runner();
    Object.defineProperty(exports2, "runAstGrepScan", { enumerable: true, get: function() {
      return runner_1.runAstGrepScan;
    } });
    var pipeline_1 = require_pipeline();
    Object.defineProperty(exports2, "runHydrationPipeline", { enumerable: true, get: function() {
      return pipeline_1.runHydrationPipeline;
    } });
    var hydrateCommand_1 = require_hydrateCommand();
    Object.defineProperty(exports2, "parseHydrateArgv", { enumerable: true, get: function() {
      return hydrateCommand_1.parseHydrateArgv;
    } });
    Object.defineProperty(exports2, "runHydrationPipelineFromArgv", { enumerable: true, get: function() {
      return hydrateCommand_1.runHydrationPipelineFromArgv;
    } });
    var mergeUtils_1 = require_mergeUtils();
    Object.defineProperty(exports2, "mergeSnapshots", { enumerable: true, get: function() {
      return mergeUtils_1.mergeSnapshots;
    } });
    Object.defineProperty(exports2, "annotatedToConflictFile", { enumerable: true, get: function() {
      return mergeUtils_1.annotatedToConflictFile;
    } });
    Object.defineProperty(exports2, "conflictRegionsToAnnotatedLines", { enumerable: true, get: function() {
      return mergeUtils_1.conflictRegionsToAnnotatedLines;
    } });
    Object.defineProperty(exports2, "conflictFileFromBlocks", { enumerable: true, get: function() {
      return mergeUtils_1.conflictFileFromBlocks;
    } });
    Object.defineProperty(exports2, "heuristicResolvedLines", { enumerable: true, get: function() {
      return mergeUtils_1.heuristicResolvedLines;
    } });
    Object.defineProperty(exports2, "suggestionLineCountOk", { enumerable: true, get: function() {
      return mergeUtils_1.suggestionLineCountOk;
    } });
    Object.defineProperty(exports2, "applyTonicResolutions", { enumerable: true, get: function() {
      return mergeUtils_1.applyTonicResolutions;
    } });
    Object.defineProperty(exports2, "applyTonicHeuristic", { enumerable: true, get: function() {
      return mergeUtils_1.applyTonicHeuristic;
    } });
    Object.defineProperty(exports2, "hydrateTonicAnnotatedAuthorIntent", { enumerable: true, get: function() {
      return mergeUtils_1.hydrateTonicAnnotatedAuthorIntent;
    } });
    var manifest_1 = require_manifest();
    Object.defineProperty(exports2, "parseManifestJson", { enumerable: true, get: function() {
      return manifest_1.parseManifestJson;
    } });
    Object.defineProperty(exports2, "serializeManifestJson", { enumerable: true, get: function() {
      return manifest_1.serializeManifestJson;
    } });
    Object.defineProperty(exports2, "pathEntryForFile", { enumerable: true, get: function() {
      return manifest_1.pathEntryForFile;
    } });
    var hashutil_1 = require_hashutil();
    Object.defineProperty(exports2, "normalizeLf", { enumerable: true, get: function() {
      return hashutil_1.normalizeLf;
    } });
    Object.defineProperty(exports2, "sha256HexUtf8", { enumerable: true, get: function() {
      return hashutil_1.sha256HexUtf8;
    } });
    Object.defineProperty(exports2, "sha256HexBytes", { enumerable: true, get: function() {
      return hashutil_1.sha256HexBytes;
    } });
    var verify_1 = require_verify();
    Object.defineProperty(exports2, "applyLfsPointerChecks", { enumerable: true, get: function() {
      return verify_1.applyLfsPointerChecks;
    } });
    Object.defineProperty(exports2, "verifyManifest", { enumerable: true, get: function() {
      return verify_1.verifyManifest;
    } });
    Object.defineProperty(exports2, "verifyReportDict", { enumerable: true, get: function() {
      return verify_1.verifyReportDict;
    } });
    Object.defineProperty(exports2, "verifyReportJson", { enumerable: true, get: function() {
      return verify_1.verifyReportJson;
    } });
    Object.defineProperty(exports2, "verifyReportStatus", { enumerable: true, get: function() {
      return verify_1.verifyReportStatus;
    } });
    Object.defineProperty(exports2, "verifyStaged", { enumerable: true, get: function() {
      return verify_1.verifyStaged;
    } });
    Object.defineProperty(exports2, "weaveBlobPath", { enumerable: true, get: function() {
      return verify_1.weaveBlobPath;
    } });
    Object.defineProperty(exports2, "DEFAULT_WEAVE_ROOT", { enumerable: true, get: function() {
      return verify_1.DEFAULT_WEAVE_ROOT;
    } });
    var lfs_1 = require_lfs();
    Object.defineProperty(exports2, "findLfsPointersUnder", { enumerable: true, get: function() {
      return lfs_1.findLfsPointersUnder;
    } });
    Object.defineProperty(exports2, "isLfsPointer", { enumerable: true, get: function() {
      return lfs_1.isLfsPointer;
    } });
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode11 = __toESM(require("vscode"));
var import_core11 = __toESM(require_dist2());

// src/commands/applyReportToWorkspace.ts
var vscode2 = __toESM(require("vscode"));
var import_core2 = __toESM(require_dist2());

// src/gitMergeReconstruct.ts
var vscode = __toESM(require("vscode"));
var import_core = __toESM(require_dist2());
function reportRegionsToCore(regions) {
  return (regions ?? []).map((r) => ({
    baseContent: r.base_content ?? "",
    leftContent: r.left_content ?? "",
    rightContent: r.right_content ?? "",
    startLine: r.start_line,
    endLine: r.end_line,
    conflictKind: r.conflict_kind,
    conflictBaseKind: r.conflict_base_kind,
    conflictTags: r.conflict_tags,
    markerLabelBegin: r.marker_label_begin,
    markerLabelMid: r.marker_label_mid
  }));
}
function readGitMergeDefaultsFromConfig() {
  const c = vscode.workspace.getConfiguration("tonic");
  return {
    leftIntent: c.get("gitMergeIntent.leftDefault", "preserve_base") ?? "preserve_base",
    rightIntent: c.get("gitMergeIntent.rightDefault", "prefer_head") ?? "prefer_head",
    leftAuthor: c.get("gitMergeAuthor.leftDefault", "") ?? "",
    rightAuthor: c.get("gitMergeAuthor.rightDefault", "") ?? ""
  };
}
function applyGitMergeReconstructDefaults(regions, d) {
  return regions.map((r) => {
    if (r.markerLabelBegin || r.markerLabelMid) {
      return r;
    }
    const meta = (0, import_core.parseConflictLabel)(r.conflictKind ?? "");
    if (meta.baseKind.trim().toLowerCase() !== "git merge") {
      return r;
    }
    const tags = { ...meta.tags, ...r.conflictTags ?? {} };
    if (!tags.intent) {
      tags.intent = d.leftIntent;
    }
    if (!tags.author) {
      tags.author = d.leftAuthor.trim() || "base";
    }
    if (!tags.intent_right) {
      tags.intent_right = d.rightIntent;
    }
    if (!tags.author_right) {
      tags.author_right = d.rightAuthor.trim() || "head";
    }
    return {
      ...r,
      conflictBaseKind: "git merge",
      conflictTags: tags,
      conflictKind: (0, import_core.formatConflictLabel)("git merge", tags)
    };
  });
}

// src/commands/applyReportToWorkspace.ts
function artifactBody(a) {
  if (a.annotated_lines?.length) {
    return a.annotated_lines.join("\n");
  }
  const raw = reportRegionsToCore(a.conflict_regions);
  if (raw.length) {
    const regions = applyGitMergeReconstructDefaults(raw, readGitMergeDefaultsFromConfig());
    return (0, import_core2.conflictRegionsToAnnotatedLines)(regions).join("\n");
  }
  return null;
}
async function applyArtifactToWorkspace(_report, artifact) {
  const folder = vscode2.workspace.workspaceFolders?.[0];
  if (!folder) {
    await vscode2.window.showErrorMessage("Tonic: open a folder in the workspace first.");
    return;
  }
  const body = artifactBody(artifact);
  if (body == null) {
    await vscode2.window.showErrorMessage(
      "Tonic: no annotated_lines or conflict_regions to write for this file."
    );
    return;
  }
  const target = vscode2.Uri.joinPath(folder.uri, artifact.path.replace(/\\/g, "/"));
  const pick = await vscode2.window.showWarningMessage(
    `Tonic: overwrite workspace file?
${vscode2.workspace.asRelativePath(target)}`,
    { modal: true },
    "Write file",
    "Cancel"
  );
  if (pick !== "Write file") {
    return;
  }
  try {
    await vscode2.workspace.fs.stat(target);
    const norm = artifact.path.replace(/\\/g, "/").split("/");
    const fileName = norm.pop() ?? "file";
    const bakName = `${fileName}.tonic.bak`;
    const bak = norm.length > 0 ? vscode2.Uri.joinPath(folder.uri, ...norm, bakName) : vscode2.Uri.joinPath(folder.uri, bakName);
    const prev = await vscode2.workspace.fs.readFile(target);
    await vscode2.workspace.fs.writeFile(bak, prev);
  } catch {
  }
  await vscode2.workspace.fs.writeFile(target, Buffer.from(body, "utf8"));
  await vscode2.window.showInformationMessage(
    `Tonic: wrote markers to ${artifact.path}. Open the file to use CodeLens / decorations.`
  );
  const doc = await vscode2.workspace.openTextDocument(target);
  await vscode2.window.showTextDocument(doc);
}

// src/diagnosticsProvider.ts
var vscode3 = __toESM(require("vscode"));
var import_core3 = __toESM(require_dist2());
function lineFromWarning(w) {
  const m = w.match(/line (\d+)/);
  if (m) {
    return Math.max(0, parseInt(m[1], 10) - 1);
  }
  return 0;
}
function collectTonicDiagnostics(text) {
  const out = [];
  if (text.includes("<<<<<<< begin ")) {
    const { warnings } = (0, import_core3.parseTonicConflictsWithDiagnostics)(text);
    for (const w of warnings) {
      const ln = lineFromWarning(w);
      out.push(
        new vscode3.Diagnostic(
          new vscode3.Range(ln, 0, ln, 0),
          w,
          vscode3.DiagnosticSeverity.Warning
        )
      );
    }
  }
  if ((0, import_core3.hasGitConflictMarkers)(text)) {
    const { warnings } = (0, import_core3.parseGitConflictsWithDiagnostics)(text);
    for (const w of warnings) {
      const ln = lineFromWarning(w);
      out.push(
        new vscode3.Diagnostic(
          new vscode3.Range(ln, 0, ln, 0),
          `Git conflict: ${w}`,
          vscode3.DiagnosticSeverity.Information
        )
      );
    }
  }
  return out;
}
function registerTonicDiagnostics(context) {
  const coll = vscode3.languages.createDiagnosticCollection("tonic");
  const refresh = (doc) => {
    if (!doc || doc.uri.scheme !== "file") {
      return;
    }
    const t = doc.getText();
    if (!t.includes("<<<<<<< ") && !(0, import_core3.hasGitConflictMarkers)(t)) {
      coll.delete(doc.uri);
      return;
    }
    coll.set(doc.uri, collectTonicDiagnostics(t));
  };
  context.subscriptions.push(coll);
  context.subscriptions.push(
    vscode3.workspace.onDidOpenTextDocument((d) => refresh(d))
  );
  context.subscriptions.push(
    vscode3.workspace.onDidChangeTextDocument((e) => refresh(e.document))
  );
  context.subscriptions.push(
    vscode3.window.onDidChangeActiveTextEditor((ed) => refresh(ed?.document))
  );
  refresh(vscode3.window.activeTextEditor?.document);
  return coll;
}

// src/codeLensProvider.ts
var vscode4 = __toESM(require("vscode"));
var import_core4 = __toESM(require_dist2());
var TonicCodeLensProvider = class {
  _onDidChange = new vscode4.EventEmitter();
  onDidChangeCodeLenses = this._onDidChange.event;
  provideCodeLenses(doc) {
    if (!doc.getText().includes("<<<<<<< begin ")) {
      return [];
    }
    const blocks = (0, import_core4.parseTonicConflicts)(doc.getText());
    const lenses = [];
    for (const b of blocks) {
      const range = new vscode4.Range(b.startLine, 0, b.startLine, 0);
      lenses.push(
        new vscode4.CodeLens(range, {
          title: "Keep Left",
          command: "tonic.keepLeft",
          arguments: [b.startLine]
        })
      );
      lenses.push(
        new vscode4.CodeLens(range, {
          title: "Keep Right",
          command: "tonic.keepRight",
          arguments: [b.startLine]
        })
      );
      lenses.push(
        new vscode4.CodeLens(range, {
          title: "Keep Both",
          command: "tonic.keepBoth",
          arguments: [b.startLine]
        })
      );
      lenses.push(
        new vscode4.CodeLens(range, {
          title: "Resolve with AI",
          command: "tonic.resolveWithAI",
          arguments: [b.startLine]
        })
      );
    }
    return lenses;
  }
  refresh() {
    this._onDidChange.fire();
  }
};

// src/decorations.ts
var vscode6 = __toESM(require("vscode"));
var import_core6 = __toESM(require_dist2());

// src/config/conflictLabelConfig.ts
var vscode5 = __toESM(require("vscode"));
var import_core5 = __toESM(require_dist2());
var PALETTES = {
  tonic: {
    "added left": "#fff3cd",
    "added right": "#cce5ff",
    "added both": "#d4edda",
    "deleted left": "#f8d7da",
    "deleted right": "#fce5cd",
    "deleted both": "#e2e3e5",
    "git merge": "#e7d9ff"
  },
  contrast: {
    "added left": "#ffe082",
    "added right": "#81d4fa",
    "added both": "#a5d6a7",
    "deleted left": "#ef9a9a",
    "deleted right": "#ffcc80",
    "deleted both": "#b0bec5",
    "git merge": "#ce93d8"
  }
};
function asPalette(value) {
  switch (value) {
    case "contrast":
      return "contrast";
    case "tonic":
    default:
      return "tonic";
  }
}
function parseRules(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.rules)) {
    return [];
  }
  const out = [];
  for (const raw of value.rules) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw;
    if (typeof candidate.backgroundColor !== "string" || !candidate.backgroundColor.trim()) {
      continue;
    }
    const tags = {};
    if (candidate.tags && typeof candidate.tags === "object") {
      for (const [k, v] of Object.entries(candidate.tags)) {
        if (typeof v === "string") {
          tags[k] = v;
        }
      }
    }
    out.push({
      kind: typeof candidate.kind === "string" ? candidate.kind : void 0,
      tags,
      backgroundColor: candidate.backgroundColor.trim()
    });
  }
  return out;
}
function tagsMatch(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      return false;
    }
  }
  return true;
}
function semanticColorForLabel(label) {
  const cfg = vscode5.workspace.getConfiguration("tonic");
  const enabled = cfg.get("highlight.enableSemantic", false);
  if (!enabled) {
    return void 0;
  }
  const paletteName = asPalette(cfg.get("highlight.defaultPalette", "tonic"));
  const parsed = (0, import_core5.parseConflictLabel)(label);
  const userRules = parseRules(cfg.get("conflictLabelConfig"));
  for (const rule of userRules) {
    const kindOk = !rule.kind || rule.kind === parsed.baseKind;
    const tagsOk = !rule.tags || tagsMatch(parsed.tags, rule.tags);
    if (kindOk && tagsOk) {
      return rule.backgroundColor;
    }
  }
  return PALETTES[paletteName][parsed.baseKind];
}

// src/decorations.ts
function createDecorationTypes() {
  return {
    left: vscode6.window.createTextEditorDecorationType({
      backgroundColor: new vscode6.ThemeColor("tonic.leftBackground"),
      isWholeLine: true
    }),
    right: vscode6.window.createTextEditorDecorationType({
      backgroundColor: new vscode6.ThemeColor("tonic.rightBackground"),
      isWholeLine: true
    }),
    header: vscode6.window.createTextEditorDecorationType({
      fontWeight: "bold"
    })
  };
}
function rangesForBlock(doc, block) {
  const lines = doc.getText().split(/\r?\n/);
  const left = [];
  const right = [];
  const headers = [];
  headers.push(
    new vscode6.Range(block.startLine, 0, block.startLine, lines[block.startLine]?.length ?? 0)
  );
  let linePtr = block.startLine + 1;
  for (let s = 0; s < block.segments.length; s++) {
    const seg = block.segments[s];
    const useLeft = s % 2 === 0;
    const bucket = useLeft ? left : right;
    for (const _ of seg.lines) {
      if (linePtr < lines.length) {
        bucket.push(
          new vscode6.Range(linePtr, 0, linePtr, lines[linePtr].length)
        );
      }
      linePtr += 1;
    }
    if (s < block.segments.length - 1) {
      if (linePtr < lines.length && lines[linePtr].startsWith("======= begin ")) {
        headers.push(
          new vscode6.Range(linePtr, 0, linePtr, lines[linePtr].length)
        );
        linePtr += 1;
      }
    }
  }
  if (linePtr < lines.length && lines[linePtr].startsWith(">>>>>>> end conflict")) {
    headers.push(new vscode6.Range(linePtr, 0, linePtr, lines[linePtr].length));
  }
  return { left, right, headers };
}
function decorateDocument(editor, types) {
  const doc = editor.document;
  const text = doc.getText();
  const blocks = (0, import_core6.parseTonicConflicts)(text);
  const left = [];
  const right = [];
  const headers = [];
  for (const b of blocks) {
    const r = rangesForBlock(doc, b);
    left.push(...r.left);
    right.push(...r.right);
    headers.push(...r.headers);
  }
  const semanticLeft = collectSemanticRanges(doc, blocks, 0);
  const semanticRight = collectSemanticRanges(doc, blocks, 1);
  if (semanticLeft.size === 0 && semanticRight.size === 0) {
    editor.setDecorations(types.left, left);
    editor.setDecorations(types.right, right);
  } else {
    editor.setDecorations(types.left, []);
    editor.setDecorations(types.right, []);
    const merged = /* @__PURE__ */ new Map();
    for (const [color, ranges] of [...semanticLeft.entries(), ...semanticRight.entries()]) {
      merged.set(color, [...merged.get(color) ?? [], ...ranges]);
    }
    applySemanticDecorations(editor, merged);
  }
  editor.setDecorations(types.header, headers);
}
var dynamicDecorationTypes = [];
function collectSemanticRanges(doc, blocks, parity) {
  const byColor = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    const rangeSet = rangesForBlock(doc, block);
    const ranges = parity === 0 ? rangeSet.left : rangeSet.right;
    if (ranges.length === 0) {
      continue;
    }
    const segment = block.segments.find((_, idx) => idx % 2 === parity);
    const color = semanticColorForLabel(segment?.label ?? block.kind);
    if (!color) {
      continue;
    }
    byColor.set(color, [...byColor.get(color) ?? [], ...ranges]);
  }
  return byColor;
}
function applySemanticDecorations(editor, byColor) {
  while (dynamicDecorationTypes.length > 0) {
    dynamicDecorationTypes.pop()?.dispose();
  }
  for (const [color, ranges] of byColor.entries()) {
    const type = vscode6.window.createTextEditorDecorationType({
      backgroundColor: color,
      isWholeLine: true
    });
    dynamicDecorationTypes.push(type);
    editor.setDecorations(type, ranges);
  }
}

// src/mergeEditorIntegration.ts
var vscode7 = __toESM(require("vscode"));
async function openInMergeEditor(uri) {
  const mergeCommand = "merge.mergeEditor.openFromResource";
  const available = await vscode7.commands.getCommands(true);
  if (!available.includes(mergeCommand)) {
    const pick = await vscode7.window.showInformationMessage(
      "Merge editor command is unavailable in this workspace. Open file and jump to next Tonic conflict?",
      "Open file",
      "Open + Next conflict"
    );
    await vscode7.window.showTextDocument(uri);
    if (pick === "Open + Next conflict") {
      await vscode7.commands.executeCommand("tonic.jumpNextConflict");
    }
    return;
  }
  try {
    await vscode7.commands.executeCommand(mergeCommand, uri);
  } catch {
    const pick = await vscode7.window.showInformationMessage(
      "Could not open merge editor for this file. Open file and jump to next Tonic conflict?",
      "Open file",
      "Open + Next conflict"
    );
    await vscode7.window.showTextDocument(uri);
    if (pick === "Open + Next conflict") {
      await vscode7.commands.executeCommand("tonic.jumpNextConflict");
    }
  }
}

// src/conflictTreeView.ts
var vscode8 = __toESM(require("vscode"));
var import_core7 = __toESM(require_dist2());
var ConflictTreeProvider = class {
  _doc;
  _onDidChange = new vscode8.EventEmitter();
  onDidChangeTreeData = this._onDidChange.event;
  setDocument(doc) {
    this._doc = doc;
    this._onDidChange.fire(void 0);
  }
  getTreeItem(element) {
    return element;
  }
  getChildren(element) {
    if (element) {
      return [];
    }
    if (!this._doc) {
      return [];
    }
    const blocks = (0, import_core7.parseTonicConflicts)(this._doc.getText());
    return blocks.map((b, i) => {
      const meta = (0, import_core7.parseConflictLabel)(b.kind);
      const author = meta.tags.author ? ` | author:${meta.tags.author}` : "";
      const intent = meta.tags.intent ? ` | intent:${meta.tags.intent}` : "";
      return new ConflictItem(
        `${(0, import_core7.conflictSummary)(b)}${author}${intent}`,
        b.startLine,
        i,
        vscode8.TreeItemCollapsibleState.None
      );
    });
  }
};
var ConflictItem = class extends vscode8.TreeItem {
  constructor(label, startLine, idx, state) {
    super(label, state);
    this.startLine = startLine;
    this.command = {
      command: "tonic.jumpToLine",
      title: "Jump",
      arguments: [startLine]
    };
    this.iconPath = new vscode8.ThemeIcon("warning");
  }
};

// src/commands/resolveActions.ts
var vscode9 = __toESM(require("vscode"));
var import_core8 = __toESM(require_dist2());
function findBlockAtLine(blocks, line) {
  return blocks.find((b) => b.startLine === line) ?? blocks[0];
}
async function keepLeft(editor, startLine) {
  const blocks = (0, import_core8.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return;
  }
  const leftText = b.segments[0]?.lines.join("\n") ?? "";
  await replaceBlock(editor, b.startLine, b.endLine, leftText);
}
async function keepRight(editor, startLine) {
  const blocks = (0, import_core8.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b || b.segments.length < 2) {
    return;
  }
  const rightText = b.segments[1]?.lines.join("\n") ?? "";
  await replaceBlock(editor, b.startLine, b.endLine, rightText);
}
async function keepBoth(editor, startLine) {
  const blocks = (0, import_core8.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return;
  }
  const parts = b.segments.map((s) => s.lines.join("\n")).filter(Boolean);
  await replaceBlock(editor, b.startLine, b.endLine, parts.join("\n"));
}
async function applyResolvedLines(editor, startLine, resolvedLines) {
  const blocks = (0, import_core8.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return false;
  }
  await replaceBlock(editor, b.startLine, b.endLine, resolvedLines.join("\n"));
  return true;
}
async function replaceBlock(editor, startLine, endLine, newBody) {
  const start = new vscode9.Position(startLine, 0);
  const end = new vscode9.Position(endLine, editor.document.lineAt(endLine).text.length);
  const range = new vscode9.Range(start, end);
  await editor.edit((eb) => eb.replace(range, newBody));
}

// src/agentIntegration.ts
var vscode10 = __toESM(require("vscode"));
var import_node_child_process = require("node:child_process");
var import_core10 = __toESM(require_dist2());

// src/importContext.ts
var lastReport;
var lastArtifact;
function setLastImportedArtifact(report, artifact) {
  lastReport = report;
  lastArtifact = artifact;
}
function getLastImportedContext() {
  if (!lastReport || !lastArtifact) {
    return void 0;
  }
  return { report: lastReport, artifact: lastArtifact };
}

// src/promptTemplates.ts
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var import_core9 = __toESM(require_dist2());
function loadSharedPromptBundle() {
  try {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const p = path.join(repoRoot, "agents", "shared-tonic-ai-prompts", "prompts.v1.json");
    if (!fs.existsSync(p)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}
var _bundle = loadSharedPromptBundle();
var _sp = _bundle.system_prompts ?? {};
var DEFAULT_SYSTEM_PROMPT = (_sp.default ?? "").trim() || `You are an expert software developer helping to resolve merge conflicts
described with Tonic semantic markers. "Left" is the base branch version; "right" is the head (PR) version.
Conflict kinds include added left, added right, added both, deleted left, deleted right.`;
var ENHANCED_SYSTEM_PROMPT = (_sp.enhanced ?? "").trim() || `You are an expert specializing in Tonic-style merge conflicts.
Interpret left (base) vs right (head) by meaning. Conflict kinds label how each side changed; resolve with semantic understanding.`;
var CONTEXT_AWARE_SYSTEM_PROMPT = (_sp.context_aware ?? "").trim() || `You are an expert specializing in Tonic merge conflicts.
Compare left (base) and right (head); use BASE / surrounding file context when the user provides it.`;
var CHAT_OUTPUT_JSON_INSTRUCTIONS = (_bundle.github_json_response_suffix ?? "").trim() || `You MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines":["each output line"],"rationale":"one short sentence"}. Each resolved_lines entry is one logical line (no embedded newlines).`;
function contextMentions(path2, format) {
  if (format === "cursor") {
    return [`Context file (Cursor): @${path2}`];
  }
  if (format === "vscode") {
    return [`Context file (VS Code): #${path2}`];
  }
  if (format === "both") {
    return [`Context file (Cursor): @${path2}`, `Context file (VS Code): #${path2}`];
  }
  return [];
}
function buildHydratedConflictPrompt(params) {
  const contextFormat = params.contextFormat ?? "none";
  const parts = [
    `File (workspace-relative): ${params.workspaceRelativePath}`,
    ...contextMentions(params.workspaceRelativePath, contextFormat),
    ...typeof params.conflictStartLine === "number" && typeof params.conflictEndLine === "number" ? [`Conflict range (1-based lines): ${params.conflictStartLine}-${params.conflictEndLine}`] : [],
    `Conflict kind: ${params.conflictKind}`,
    ...(() => {
      const parsed = (0, import_core9.parseConflictLabel)(params.conflictKind);
      const tags = Object.entries(parsed.tags).map(([k, v]) => `${k}=${v}`);
      return tags.length ? [`Conflict tags: ${tags.join(", ")}`] : [];
    })(),
    `--- Left (base) ---`,
    params.leftHunk || "(empty)",
    `--- Right (head) ---`,
    params.rightHunk || "(empty)"
  ];
  if (params.mergedReportMeta) {
    parts.push("--- CI merge report ---", params.mergedReportMeta);
  }
  parts.push(
    "",
    "Propose merged lines that replace the entire Tonic conflict block (output must not include marker lines)."
  );
  return parts.join("\n");
}

// src/agentContract.ts
function parseAgentResult(raw) {
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Agent output must be a JSON object.");
  }
  const obj = parsed;
  if (!Array.isArray(obj.resolved_lines) || !obj.resolved_lines.every((x) => typeof x === "string")) {
    throw new Error("Agent output must include resolved_lines: string[].");
  }
  for (const ln of obj.resolved_lines) {
    if (ln.includes("\n") || ln.includes("\r")) {
      throw new Error("Each resolved_lines entry must be a single line.");
    }
  }
  return {
    resolved_lines: obj.resolved_lines,
    rationale: typeof obj.rationale === "string" ? obj.rationale : void 0
  };
}

// src/agentIntegration.ts
function providerToContextFormat(provider) {
  switch (provider) {
    case "cursor":
      return "cursor";
    case "copilot":
      return "vscode";
    case "clipboard":
      return "both";
    case "customCli":
      return "none";
    default:
      return "none";
  }
}
function buildFullPrompt(editor, provider, startLine) {
  const blocks = (0, import_core10.parseTonicConflicts)(editor.document.getText());
  const b = blocks.find((x) => x.startLine === startLine) ?? blocks[0];
  if (!b) {
    throw new Error("No Tonic conflict block found.");
  }
  const wsRel = vscode10.workspace.asRelativePath(editor.document.uri, false);
  const leftHunk = b.segments[0]?.lines.join("\n") ?? "";
  const rightHunk = b.segments[1]?.lines.join("\n") ?? "";
  const ctx = getLastImportedContext();
  let reportMeta;
  if (ctx) {
    reportMeta = [
      `artifact.path=${ctx.artifact.path}`,
      `base_sha=${ctx.report.base_sha ?? ""}`,
      `head_sha=${ctx.report.head_sha ?? ""}`,
      `base_ref=${ctx.report.base_ref ?? ""}`,
      `head_ref=${ctx.report.head_ref ?? ""}`
    ].join("\n");
  }
  const user = buildHydratedConflictPrompt({
    workspaceRelativePath: wsRel,
    conflictKind: b.kind,
    leftHunk,
    rightHunk,
    conflictStartLine: b.startLine + 1,
    conflictEndLine: b.endLine + 1,
    mergedReportMeta: reportMeta,
    contextFormat: providerToContextFormat(provider)
  });
  const full = `${ENHANCED_SYSTEM_PROMPT}

${CHAT_OUTPUT_JSON_INSTRUCTIONS}

${user}`;
  return { prompt: full, line: b.startLine };
}
async function runCustomCli(prompt) {
  const cfg = vscode10.workspace.getConfiguration("tonic");
  const command = cfg.get("agent.customCli.command", "").trim();
  const timeoutMs = cfg.get("agent.customCli.timeoutMs", 3e4);
  if (!command) {
    throw new Error("Set tonic.agent.customCli.command before using custom CLI provider.");
  }
  return await new Promise((resolve2, reject) => {
    const child = (0, import_node_child_process.spawn)(command, {
      cwd: vscode10.workspace.workspaceFolders?.[0]?.uri.fsPath,
      shell: true,
      stdio: "pipe"
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Agent CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Agent CLI exited with code ${code}.`));
        return;
      }
      resolve2(stdout.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
async function resolveWithProvider(editor, startLine) {
  const cfg = vscode10.workspace.getConfiguration("tonic");
  const provider = cfg.get("agent.provider", "clipboard") ?? "clipboard";
  const { prompt, line } = buildFullPrompt(editor, provider, startLine);
  if (provider === "clipboard" || provider === "cursor" || provider === "copilot") {
    await vscode10.env.clipboard.writeText(prompt);
    await vscode10.window.showInformationMessage(
      "Tonic: hydrated prompt copied. Paste into your chat/agent and apply returned JSON."
    );
    return;
  }
  if (provider === "customCli") {
    const raw = await runCustomCli(prompt);
    const parsed = parseAgentResult(raw);
    const applied = await applyResolvedLines(editor, line, parsed.resolved_lines);
    if (!applied) {
      throw new Error("Could not apply resolved_lines to conflict block.");
    }
    await vscode10.window.showInformationMessage(
      parsed.rationale ? `Tonic: agent resolution applied. ${parsed.rationale}` : "Tonic: agent resolution applied."
    );
    return;
  }
  throw new Error(`Unsupported tonic.agent.provider value: ${provider}`);
}

// src/mergeReport.ts
function parseMergeReportJson(text) {
  const raw = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || !("files" in raw)) {
    throw new Error("Tonic report: missing top-level 'files' array");
  }
  const files = raw.files;
  if (!Array.isArray(files)) {
    throw new Error("Tonic report: 'files' must be an array");
  }
  return raw;
}

// src/extension.ts
function normalizeFileLines(text) {
  const lines = text.split(/\r?\n/);
  return lines.length && lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
}
async function pickOneFile(title) {
  const uris = await vscode11.window.showOpenDialog({
    canSelectMany: false,
    openLabel: title
  });
  return uris?.[0];
}
function blameSummary(f) {
  const left = f.left_commit_id ? f.left_commit_id.slice(0, 12) : "";
  const right = f.right_commit_id ? f.right_commit_id.slice(0, 12) : "";
  if (!left && !right) {
    return "";
  }
  return ` | blame ${left || "?"}/${right || "?"}`;
}
var decorationTypes;
function activate(context) {
  const tryOpenLastReportPath = async () => {
    const last = context.workspaceState.get("tonic.lastReportJsonPath");
    if (!last) {
      return void 0;
    }
    try {
      const uri = vscode11.Uri.file(last);
      await vscode11.workspace.fs.stat(uri);
      return uri;
    } catch {
      return void 0;
    }
  };
  decorationTypes = createDecorationTypes();
  registerTonicDiagnostics(context);
  const codeLens = new TonicCodeLensProvider();
  const tree = new ConflictTreeProvider();
  context.subscriptions.push(
    vscode11.languages.registerCodeLensProvider({ scheme: "file" }, codeLens)
  );
  context.subscriptions.push(
    vscode11.window.registerTreeDataProvider("tonic.conflicts", tree)
  );
  const refresh = () => {
    const ed = vscode11.window.activeTextEditor;
    if (ed && decorationTypes) {
      decorateDocument(ed, decorationTypes);
    }
    tree.setDocument(ed?.document);
    codeLens.refresh();
  };
  context.subscriptions.push(
    vscode11.window.onDidChangeActiveTextEditor(() => refresh())
  );
  context.subscriptions.push(
    vscode11.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode11.window.activeTextEditor?.document) {
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode11.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("tonic")) {
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.keepLeft", async (line) => {
      const ed = vscode11.window.activeTextEditor;
      if (ed) {
        await keepLeft(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.keepRight", async (line) => {
      const ed = vscode11.window.activeTextEditor;
      if (ed) {
        await keepRight(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.keepBoth", async (line) => {
      const ed = vscode11.window.activeTextEditor;
      if (ed) {
        await keepBoth(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.acceptDeterministic", async () => {
      const leftUri = await pickOneFile("Left snapshot");
      if (!leftUri) {
        return;
      }
      const rightUri = await pickOneFile("Right snapshot");
      if (!rightUri) {
        return;
      }
      const leftBuf = await vscode11.workspace.fs.readFile(leftUri);
      const rightBuf = await vscode11.workspace.fs.readFile(rightUri);
      const left = normalizeFileLines(Buffer.from(leftBuf).toString("utf8"));
      const right = normalizeFileLines(Buffer.from(rightBuf).toString("utf8"));
      const [, annotated] = (0, import_core11.mergeSnapshots)(left, right);
      const doc = await vscode11.workspace.openTextDocument({
        content: annotated.join("\n"),
        language: "plaintext"
      });
      await vscode11.window.showTextDocument(doc, { preview: false });
      await vscode11.window.showInformationMessage(
        "Tonic: deterministic merge (from @mergetonic/core) opened as a new document with markers."
      );
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.openMergeEditor", async () => {
      const ed = vscode11.window.activeTextEditor;
      if (ed) {
        await openInMergeEditor(ed.document.uri);
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.resolveWithAgent", async (line) => {
      const ed = vscode11.window.activeTextEditor;
      if (!ed) {
        return;
      }
      try {
        await resolveWithProvider(ed, line ?? ed.selection.active.line);
        refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode11.window.showErrorMessage(`Tonic agent resolve failed: ${msg}`);
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.resolveWithAI", async (line) => {
      const ed = vscode11.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const blocks = (0, import_core11.parseTonicConflicts)(ed.document.getText());
      const b = blocks.find((x) => x.startLine === line) ?? blocks[0];
      if (!b) {
        await vscode11.window.showInformationMessage("Tonic: no conflict block found.");
        return;
      }
      const wsRel = vscode11.workspace.asRelativePath(ed.document.uri, false);
      const leftHunk = b.segments[0]?.lines.join("\n") ?? "";
      const rightHunk = b.segments[1]?.lines.join("\n") ?? "";
      const ctx = getLastImportedContext();
      let reportMeta;
      if (ctx) {
        reportMeta = [
          `artifact.path=${ctx.artifact.path}`,
          `base_sha=${ctx.report.base_sha ?? ""}`,
          `head_sha=${ctx.report.head_sha ?? ""}`,
          `base_ref=${ctx.report.base_ref ?? ""}`,
          `head_ref=${ctx.report.head_ref ?? ""}`
        ].join("\n");
      }
      const user = buildHydratedConflictPrompt({
        workspaceRelativePath: wsRel,
        conflictKind: b.kind,
        leftHunk,
        rightHunk,
        conflictStartLine: b.startLine + 1,
        conflictEndLine: b.endLine + 1,
        mergedReportMeta: reportMeta,
        contextFormat: "both"
      });
      const full = `${ENHANCED_SYSTEM_PROMPT}

${CHAT_OUTPUT_JSON_INSTRUCTIONS}

${user}`;
      await vscode11.env.clipboard.writeText(full);
      await vscode11.window.showInformationMessage(
        "Tonic: hydrated prompt copied \u2014 paste into Cursor / VS Code Chat (JSON output matches agent contract)."
      );
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.jumpNextConflict", () => {
      const ed = vscode11.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const blocks = (0, import_core11.parseTonicConflicts)(ed.document.getText());
      const cur = ed.selection.active.line;
      const next = blocks.find((b) => b.startLine > cur) ?? blocks[0];
      if (next) {
        const pos = new vscode11.Position(next.startLine, 0);
        ed.selection = new vscode11.Selection(pos, pos);
        ed.revealRange(new vscode11.Range(pos, pos));
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.jumpToLine", (ln) => {
      const ed = vscode11.window.activeTextEditor;
      if (ed) {
        const pos = new vscode11.Position(ln, 0);
        ed.selection = new vscode11.Selection(pos, pos);
        ed.revealRange(new vscode11.Range(pos, pos));
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.gitConflictsToTonicPreview", async () => {
      const ed = vscode11.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const text = ed.document.getText();
      if (!(0, import_core11.hasGitConflictMarkers)(text)) {
        await vscode11.window.showInformationMessage("Tonic: no Git conflict markers in this file.");
        return;
      }
      const blocks = (0, import_core11.parseGitConflicts)(text);
      const lines = (0, import_core11.gitConflictBlocksToTonicAnnotatedPreview)(blocks);
      const doc = await vscode11.workspace.openTextDocument({
        content: lines.join("\n"),
        language: "plaintext"
      });
      await vscode11.window.showTextDocument(doc, { preview: true });
      await vscode11.window.showInformationMessage(
        "Tonic: opened Tonic-style preview from Git markers (read-only buffer)."
      );
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.applyMergeReportToWorkspace", async () => {
      const uris = await vscode11.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] },
        openLabel: "Select merge report"
      });
      if (!uris?.[0]) {
        return;
      }
      let text;
      try {
        text = Buffer.from(await vscode11.workspace.fs.readFile(uris[0])).toString("utf8");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode11.window.showErrorMessage(`Tonic: could not read report: ${msg}`);
        return;
      }
      try {
        const report = parseMergeReportJson(text);
        const candidates = report.files.filter(
          (f) => f.markers_present && ((f.annotated_lines?.length ?? 0) > 0 || (f.conflict_regions?.length ?? 0) > 0)
        );
        if (!candidates.length) {
          await vscode11.window.showInformationMessage(
            "Tonic: no conflicted files with marker data in this report."
          );
          return;
        }
        const picked = await vscode11.window.showQuickPick(
          candidates.map((f) => ({
            label: f.path,
            description: `${f.conflict_regions?.length ?? 0} region(s)${blameSummary(f)}`,
            artifact: f
          })),
          { title: "Apply Tonic markers to workspace path" }
        );
        if (!picked) {
          return;
        }
        await applyArtifactToWorkspace(report, picked.artifact);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode11.window.showErrorMessage(`Tonic: ${msg}`);
      }
    })
  );
  context.subscriptions.push(
    vscode11.commands.registerCommand("tonic.importMergeReport", async () => {
      const globHint = vscode11.workspace.getConfiguration("tonic").get("defaultReportGlob");
      const choice = await vscode11.window.showQuickPick(
        ["Open JSON file", "Paste JSON", "Re-open last report file"],
        {
          title: "Import Tonic merge report",
          placeHolder: globHint ? `Hint: ${globHint}` : void 0
        }
      );
      let text;
      if (choice === "Open JSON file") {
        const defaultUri = await tryOpenLastReportPath();
        const uris = await vscode11.window.showOpenDialog({
          canSelectMany: false,
          defaultUri: defaultUri ?? void 0,
          filters: { JSON: ["json"] },
          openLabel: "Import"
        });
        if (!uris?.length) {
          return;
        }
        await context.workspaceState.update("tonic.lastReportJsonPath", uris[0].fsPath);
        text = Buffer.from(await vscode11.workspace.fs.readFile(uris[0])).toString("utf8");
      } else if (choice === "Re-open last report file") {
        const uri = await tryOpenLastReportPath();
        if (!uri) {
          await vscode11.window.showInformationMessage("Tonic: no saved report path for this workspace.");
          return;
        }
        text = Buffer.from(await vscode11.workspace.fs.readFile(uri)).toString("utf8");
      } else if (choice === "Paste JSON") {
        text = await vscode11.window.showInputBox({
          title: "Paste merge-tonic-report.json contents",
          ignoreFocusOut: true
        });
        if (!text?.trim()) {
          return;
        }
      } else {
        return;
      }
      try {
        const report = parseMergeReportJson(text);
        const withMarkers = report.files.filter((f) => f.markers_present && f.annotated_lines?.length);
        const legacy = report.files.filter(
          (f) => f.markers_present && !(f.annotated_lines?.length ?? 0) && (f.conflict_regions?.length ?? 0) > 0
        );
        let items = withMarkers.map((f) => ({
          label: f.path,
          description: `${f.conflict_regions?.length ?? 0} region(s)${blameSummary(f)}`,
          artifact: f
        }));
        if (!items.length && legacy.length) {
          const legPick = await vscode11.window.showQuickPick(
            legacy.map((f) => ({
              label: f.path,
              description: `${f.conflict_regions?.length ?? 0} region(s) \u2014 reconstruct markers`,
              artifact: f
            })),
            { title: "No annotated_lines \u2014 open reconstructed Tonic markers from regions?" }
          );
          if (!legPick) {
            return;
          }
          items = [
            {
              label: legPick.label,
              description: legPick.description,
              artifact: legPick.artifact,
              reconstructed: true
            }
          ];
        }
        if (!items.length) {
          const hasMarkersNoAnnotated = report.files.some(
            (f) => f.markers_present && !f.annotated_lines?.length
          );
          const msg = hasMarkersNoAnnotated ? "Tonic: markers_present but no annotated_lines and no conflict_regions to reconstruct. Use a current agent run." : "Tonic: no files with conflict markers in this report.";
          await vscode11.window.showInformationMessage(msg);
          return;
        }
        let picked;
        if (items.length === 1) {
          picked = items[0];
        } else {
          const multi = await vscode11.window.showQuickPick(items, {
            title: "Open annotated merge output",
            placeHolder: "Select a file"
          });
          picked = multi ?? void 0;
        }
        if (!picked) {
          return;
        }
        let body;
        if (picked.reconstructed) {
          const raw = reportRegionsToCore(picked.artifact.conflict_regions);
          const regions = applyGitMergeReconstructDefaults(raw, readGitMergeDefaultsFromConfig());
          body = (0, import_core11.conflictRegionsToAnnotatedLines)(regions).join("\n");
        } else {
          body = picked.artifact.annotated_lines.join("\n");
        }
        setLastImportedArtifact(report, picked.artifact);
        const doc = await vscode11.workspace.openTextDocument({
          content: body,
          language: "plaintext"
        });
        await vscode11.window.showTextDocument(doc, { preview: true });
        await vscode11.window.showInformationMessage(
          `Tonic: opened ${picked.reconstructed ? "reconstructed" : "annotated"} output for ${picked.label} (left=base, right=head).`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode11.window.showErrorMessage(`Tonic import failed: ${msg}`);
      }
    })
  );
  refresh();
}
function deactivate() {
  decorationTypes?.left.dispose();
  decorationTypes?.right.dispose();
  decorationTypes?.header.dispose();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
