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

// ../../packages/tonic-core/dist/conflictParser.js
var require_conflictParser = __commonJS({
  "../../packages/tonic-core/dist/conflictParser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.parseTonicConflicts = parseTonicConflicts7;
    exports2.parseTonicConflictsWithDiagnostics = parseTonicConflictsWithDiagnostics2;
    exports2.conflictSummary = conflictSummary2;
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
        i += 1;
        const segments = [];
        let currentLabel = kind;
        let current = [];
        let closed = false;
        while (i < lines.length) {
          const line = lines[i];
          if (END.test(line)) {
            segments.push({ label: currentLabel, lines: current });
            blocks.push({
              startLine,
              endLine: i,
              kind,
              segments
            });
            i += 1;
            closed = true;
            break;
          }
          const mm = MID.exec(line);
          if (mm) {
            segments.push({ label: currentLabel, lines: current });
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
              segments: [
                { label: oursRef, lines: oursLines },
                { label: theirsRef, lines: theirsLines }
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
    var core_1 = require_core();
    function mergeSnapshots2(leftLines, rightLines, opts) {
      const [mergedState, annotated] = (0, core_1.mergeStates)((0, core_1.initialState)(leftLines, opts?.leftCommitId), (0, core_1.initialState)(rightLines, opts?.rightCommitId));
      return [(0, core_1.currentLines)(mergedState), annotated];
    }
    function annotatedToConflictFile(path, annotatedLines) {
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
        for (const cl of inner) {
          if (cl.startsWith("======= begin ")) {
            seenMid = true;
            continue;
          }
          if (!seenMid) {
            leftLines.push(cl);
          } else {
            rightLines.push(cl);
          }
        }
        conflicts.push({
          baseContent: "",
          leftContent: leftLines.join("\n"),
          rightContent: rightLines.join("\n"),
          startLine,
          endLine,
          conflictKind: kind
        });
        if (i < n && annotatedLines[i].startsWith(">>>>>>> end conflict")) {
          i += 1;
        }
      }
      return { path, conflicts, content: text };
    }
    function conflictRegionsToAnnotatedLines3(regions) {
      const out = [];
      for (const r of regions) {
        const kind = r.conflictKind.trim() || "added both";
        out.push(`<<<<<<< begin ${kind}`);
        const left = r.leftContent ? r.leftContent.split(/\r?\n/) : [];
        const right = r.rightContent ? r.rightContent.split(/\r?\n/) : [];
        for (const ln of left) {
          out.push(ln);
        }
        out.push(`======= begin ${kind}`);
        for (const ln of right) {
          out.push(ln);
        }
        out.push(">>>>>>> end conflict");
      }
      return out;
    }
    function conflictFileFromBlocks(path, text, blocks) {
      return {
        path,
        content: text,
        conflicts: blocks.map((b) => {
          const leftLines = b.segments[0]?.lines ?? [];
          const rightLines = b.segments[1]?.lines ?? [];
          return {
            baseContent: "",
            leftContent: leftLines.join("\n"),
            rightContent: rightLines.join("\n"),
            startLine: b.startLine + 1,
            endLine: b.endLine + 1,
            conflictKind: b.kind
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
  }
});

// ../../packages/tonic-core/dist/markerInterop.js
var require_markerInterop = __commonJS({
  "../../packages/tonic-core/dist/markerInterop.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.gitConflictBlocksToConflictRegions = gitConflictBlocksToConflictRegions;
    exports2.gitConflictBlocksToTonicAnnotatedPreview = gitConflictBlocksToTonicAnnotatedPreview2;
    var mergeUtils_1 = require_mergeUtils();
    var GIT_MERGE_KIND = "git merge";
    function gitConflictBlocksToConflictRegions(blocks) {
      return blocks.map((b) => {
        const leftLines = b.segments[0]?.lines ?? [];
        const rightLines = b.segments[1]?.lines ?? [];
        return {
          baseContent: "",
          leftContent: leftLines.join("\n"),
          rightContent: rightLines.join("\n"),
          startLine: b.startLine + 1,
          endLine: b.endLine + 1,
          conflictKind: b.kind === GIT_MERGE_KIND ? GIT_MERGE_KIND : b.kind
        };
      });
    }
    function gitConflictBlocksToTonicAnnotatedPreview2(blocks) {
      const regions = gitConflictBlocksToConflictRegions(blocks);
      return (0, mergeUtils_1.conflictRegionsToAnnotatedLines)(regions.map((r) => ({ ...r, conflictKind: GIT_MERGE_KIND })));
    }
  }
});

// ../../packages/tonic-core/dist/index.js
var require_dist = __commonJS({
  "../../packages/tonic-core/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.applyTonicHeuristic = exports2.applyTonicResolutions = exports2.suggestionLineCountOk = exports2.heuristicResolvedLines = exports2.conflictFileFromBlocks = exports2.conflictRegionsToAnnotatedLines = exports2.annotatedToConflictFile = exports2.mergeSnapshots = exports2.gitConflictBlocksToTonicAnnotatedPreview = exports2.gitConflictBlocksToConflictRegions = exports2.hasGitConflictMarkers = exports2.parseGitConflictsWithDiagnostics = exports2.parseGitConflicts = exports2.conflictSummary = exports2.parseTonicConflictsWithDiagnostics = exports2.parseTonicConflicts = exports2.deserializeState = exports2.serializeState = exports2.conflictCode = exports2.showConflicts = exports2.END_MARKER = exports2.conflictStrings = exports2.PEACE = exports2.CONFLICT_DELETED_RIGHT = exports2.CONFLICT_DELETED_LEFT = exports2.CONFLICT_ADDED_BOTH = exports2.CONFLICT_ADDED_RIGHT = exports2.CONFLICT_ADDED_LEFT = exports2.mergeStates = exports2.updateState = exports2.currentLines = exports2.initialState = void 0;
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
  }
});

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode9 = __toESM(require("vscode"));
var import_core8 = __toESM(require_dist());

// src/commands/applyReportToWorkspace.ts
var vscode = __toESM(require("vscode"));
var import_core = __toESM(require_dist());
function regionsJsonToCore(regions) {
  return (regions ?? []).map((r) => ({
    baseContent: r.base_content ?? "",
    leftContent: r.left_content ?? "",
    rightContent: r.right_content ?? "",
    startLine: r.start_line,
    endLine: r.end_line,
    conflictKind: r.conflict_kind
  }));
}
function artifactBody(a) {
  if (a.annotated_lines?.length) {
    return a.annotated_lines.join("\n");
  }
  const regions = regionsJsonToCore(a.conflict_regions);
  if (regions.length) {
    return (0, import_core.conflictRegionsToAnnotatedLines)(regions).join("\n");
  }
  return null;
}
async function applyArtifactToWorkspace(_report, artifact) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    await vscode.window.showErrorMessage("Tonic: open a folder in the workspace first.");
    return;
  }
  const body = artifactBody(artifact);
  if (body == null) {
    await vscode.window.showErrorMessage(
      "Tonic: no annotated_lines or conflict_regions to write for this file."
    );
    return;
  }
  const target = vscode.Uri.joinPath(folder.uri, artifact.path.replace(/\\/g, "/"));
  const pick = await vscode.window.showWarningMessage(
    `Tonic: overwrite workspace file?
${vscode.workspace.asRelativePath(target)}`,
    { modal: true },
    "Write file",
    "Cancel"
  );
  if (pick !== "Write file") {
    return;
  }
  try {
    await vscode.workspace.fs.stat(target);
    const norm = artifact.path.replace(/\\/g, "/").split("/");
    const fileName = norm.pop() ?? "file";
    const bakName = `${fileName}.tonic.bak`;
    const bak = norm.length > 0 ? vscode.Uri.joinPath(folder.uri, ...norm, bakName) : vscode.Uri.joinPath(folder.uri, bakName);
    const prev = await vscode.workspace.fs.readFile(target);
    await vscode.workspace.fs.writeFile(bak, prev);
  } catch {
  }
  await vscode.workspace.fs.writeFile(target, Buffer.from(body, "utf8"));
  await vscode.window.showInformationMessage(
    `Tonic: wrote markers to ${artifact.path}. Open the file to use CodeLens / decorations.`
  );
  const doc = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(doc);
}

// src/diagnosticsProvider.ts
var vscode2 = __toESM(require("vscode"));
var import_core2 = __toESM(require_dist());
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
    const { warnings } = (0, import_core2.parseTonicConflictsWithDiagnostics)(text);
    for (const w of warnings) {
      const ln = lineFromWarning(w);
      out.push(
        new vscode2.Diagnostic(
          new vscode2.Range(ln, 0, ln, 0),
          w,
          vscode2.DiagnosticSeverity.Warning
        )
      );
    }
  }
  if ((0, import_core2.hasGitConflictMarkers)(text)) {
    const { warnings } = (0, import_core2.parseGitConflictsWithDiagnostics)(text);
    for (const w of warnings) {
      const ln = lineFromWarning(w);
      out.push(
        new vscode2.Diagnostic(
          new vscode2.Range(ln, 0, ln, 0),
          `Git conflict: ${w}`,
          vscode2.DiagnosticSeverity.Information
        )
      );
    }
  }
  return out;
}
function registerTonicDiagnostics(context) {
  const coll = vscode2.languages.createDiagnosticCollection("tonic");
  const refresh = (doc) => {
    if (!doc || doc.uri.scheme !== "file") {
      return;
    }
    const t = doc.getText();
    if (!t.includes("<<<<<<< ") && !(0, import_core2.hasGitConflictMarkers)(t)) {
      coll.delete(doc.uri);
      return;
    }
    coll.set(doc.uri, collectTonicDiagnostics(t));
  };
  context.subscriptions.push(coll);
  context.subscriptions.push(
    vscode2.workspace.onDidOpenTextDocument((d) => refresh(d))
  );
  context.subscriptions.push(
    vscode2.workspace.onDidChangeTextDocument((e) => refresh(e.document))
  );
  context.subscriptions.push(
    vscode2.window.onDidChangeActiveTextEditor((ed) => refresh(ed?.document))
  );
  refresh(vscode2.window.activeTextEditor?.document);
  return coll;
}

// src/codeLensProvider.ts
var vscode3 = __toESM(require("vscode"));
var import_core3 = __toESM(require_dist());
var TonicCodeLensProvider = class {
  _onDidChange = new vscode3.EventEmitter();
  onDidChangeCodeLenses = this._onDidChange.event;
  provideCodeLenses(doc) {
    if (!doc.getText().includes("<<<<<<< begin ")) {
      return [];
    }
    const blocks = (0, import_core3.parseTonicConflicts)(doc.getText());
    const lenses = [];
    for (const b of blocks) {
      const range = new vscode3.Range(b.startLine, 0, b.startLine, 0);
      lenses.push(
        new vscode3.CodeLens(range, {
          title: "Keep Left",
          command: "tonic.keepLeft",
          arguments: [b.startLine]
        })
      );
      lenses.push(
        new vscode3.CodeLens(range, {
          title: "Prefer head (deterministic)",
          command: "tonic.keepRight",
          arguments: [b.startLine]
        })
      );
      lenses.push(
        new vscode3.CodeLens(range, {
          title: "Keep Both",
          command: "tonic.keepBoth",
          arguments: [b.startLine]
        })
      );
      lenses.push(
        new vscode3.CodeLens(range, {
          title: "Resolve with Agent",
          command: "tonic.resolveWithAgent",
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
var vscode4 = __toESM(require("vscode"));
var import_core4 = __toESM(require_dist());
function createDecorationTypes() {
  return {
    left: vscode4.window.createTextEditorDecorationType({
      backgroundColor: new vscode4.ThemeColor("tonic.leftBackground"),
      isWholeLine: true
    }),
    right: vscode4.window.createTextEditorDecorationType({
      backgroundColor: new vscode4.ThemeColor("tonic.rightBackground"),
      isWholeLine: true
    }),
    header: vscode4.window.createTextEditorDecorationType({
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
    new vscode4.Range(block.startLine, 0, block.startLine, lines[block.startLine]?.length ?? 0)
  );
  let linePtr = block.startLine + 1;
  for (let s = 0; s < block.segments.length; s++) {
    const seg = block.segments[s];
    const useLeft = s % 2 === 0;
    const bucket = useLeft ? left : right;
    for (const _ of seg.lines) {
      if (linePtr < lines.length) {
        bucket.push(
          new vscode4.Range(linePtr, 0, linePtr, lines[linePtr].length)
        );
      }
      linePtr += 1;
    }
    if (s < block.segments.length - 1) {
      if (linePtr < lines.length && lines[linePtr].startsWith("======= begin ")) {
        headers.push(
          new vscode4.Range(linePtr, 0, linePtr, lines[linePtr].length)
        );
        linePtr += 1;
      }
    }
  }
  if (linePtr < lines.length && lines[linePtr].startsWith(">>>>>>> end conflict")) {
    headers.push(new vscode4.Range(linePtr, 0, linePtr, lines[linePtr].length));
  }
  return { left, right, headers };
}
function decorateDocument(editor, types) {
  const doc = editor.document;
  const text = doc.getText();
  const blocks = (0, import_core4.parseTonicConflicts)(text);
  const left = [];
  const right = [];
  const headers = [];
  for (const b of blocks) {
    const r = rangesForBlock(doc, b);
    left.push(...r.left);
    right.push(...r.right);
    headers.push(...r.headers);
  }
  editor.setDecorations(types.left, left);
  editor.setDecorations(types.right, right);
  editor.setDecorations(types.header, headers);
}

// src/mergeEditorIntegration.ts
var vscode5 = __toESM(require("vscode"));
async function openInMergeEditor(uri) {
  const mergeCommand = "merge.mergeEditor.openFromResource";
  const available = await vscode5.commands.getCommands(true);
  if (!available.includes(mergeCommand)) {
    const pick = await vscode5.window.showInformationMessage(
      "Merge editor command is unavailable in this workspace. Open file and jump to next Tonic conflict?",
      "Open file",
      "Open + Next conflict"
    );
    await vscode5.window.showTextDocument(uri);
    if (pick === "Open + Next conflict") {
      await vscode5.commands.executeCommand("tonic.jumpNextConflict");
    }
    return;
  }
  try {
    await vscode5.commands.executeCommand(mergeCommand, uri);
  } catch {
    const pick = await vscode5.window.showInformationMessage(
      "Could not open merge editor for this file. Open file and jump to next Tonic conflict?",
      "Open file",
      "Open + Next conflict"
    );
    await vscode5.window.showTextDocument(uri);
    if (pick === "Open + Next conflict") {
      await vscode5.commands.executeCommand("tonic.jumpNextConflict");
    }
  }
}

// src/conflictTreeView.ts
var vscode6 = __toESM(require("vscode"));
var import_core5 = __toESM(require_dist());
var ConflictTreeProvider = class {
  _doc;
  _onDidChange = new vscode6.EventEmitter();
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
    const blocks = (0, import_core5.parseTonicConflicts)(this._doc.getText());
    return blocks.map(
      (b, i) => new ConflictItem((0, import_core5.conflictSummary)(b), b.startLine, i, vscode6.TreeItemCollapsibleState.None)
    );
  }
};
var ConflictItem = class extends vscode6.TreeItem {
  constructor(label, startLine, idx, state) {
    super(label, state);
    this.startLine = startLine;
    this.command = {
      command: "tonic.jumpToLine",
      title: "Jump",
      arguments: [startLine]
    };
    this.iconPath = new vscode6.ThemeIcon("warning");
  }
};

// src/commands/resolveActions.ts
var vscode7 = __toESM(require("vscode"));
var import_core6 = __toESM(require_dist());
function findBlockAtLine(blocks, line) {
  return blocks.find((b) => b.startLine === line) ?? blocks[0];
}
async function keepLeft(editor, startLine) {
  const blocks = (0, import_core6.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return;
  }
  const leftText = b.segments[0]?.lines.join("\n") ?? "";
  await replaceBlock(editor, b.startLine, b.endLine, leftText);
}
async function keepRight(editor, startLine) {
  const blocks = (0, import_core6.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b || b.segments.length < 2) {
    return;
  }
  const rightText = b.segments[1]?.lines.join("\n") ?? "";
  await replaceBlock(editor, b.startLine, b.endLine, rightText);
}
async function keepBoth(editor, startLine) {
  const blocks = (0, import_core6.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return;
  }
  const parts = b.segments.map((s) => s.lines.join("\n")).filter(Boolean);
  await replaceBlock(editor, b.startLine, b.endLine, parts.join("\n"));
}
async function applyResolvedLines(editor, startLine, resolvedLines) {
  const blocks = (0, import_core6.parseTonicConflicts)(editor.document.getText());
  const b = findBlockAtLine(blocks, startLine);
  if (!b) {
    return false;
  }
  await replaceBlock(editor, b.startLine, b.endLine, resolvedLines.join("\n"));
  return true;
}
async function replaceBlock(editor, startLine, endLine, newBody) {
  const start = new vscode7.Position(startLine, 0);
  const end = new vscode7.Position(endLine, editor.document.lineAt(endLine).text.length);
  const range = new vscode7.Range(start, end);
  await editor.edit((eb) => eb.replace(range, newBody));
}

// src/agentIntegration.ts
var vscode8 = __toESM(require("vscode"));
var import_node_child_process = require("node:child_process");
var import_core7 = __toESM(require_dist());

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
var ENHANCED_SYSTEM_PROMPT = `You are an expert specializing in Tonic-style merge conflicts.
Interpret left (base) vs right (head) by meaning. Conflict kinds label how each side changed; resolve with semantic understanding.`;
var CHAT_OUTPUT_JSON_INSTRUCTIONS = `You MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines":["each output line"],"rationale":"one short sentence"}. Each resolved_lines entry is one logical line (no embedded newlines).`;
function contextMentions(path, format) {
  if (format === "cursor") {
    return [`Context file (Cursor): @${path}`];
  }
  if (format === "vscode") {
    return [`Context file (VS Code): #${path}`];
  }
  if (format === "both") {
    return [`Context file (Cursor): @${path}`, `Context file (VS Code): #${path}`];
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
  const blocks = (0, import_core7.parseTonicConflicts)(editor.document.getText());
  const b = blocks.find((x) => x.startLine === startLine) ?? blocks[0];
  if (!b) {
    throw new Error("No Tonic conflict block found.");
  }
  const wsRel = vscode8.workspace.asRelativePath(editor.document.uri, false);
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
  const cfg = vscode8.workspace.getConfiguration("tonic");
  const command = cfg.get("agent.customCli.command", "").trim();
  const timeoutMs = cfg.get("agent.customCli.timeoutMs", 3e4);
  if (!command) {
    throw new Error("Set tonic.agent.customCli.command before using custom CLI provider.");
  }
  return await new Promise((resolve, reject) => {
    const child = (0, import_node_child_process.spawn)(command, {
      cwd: vscode8.workspace.workspaceFolders?.[0]?.uri.fsPath,
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
      resolve(stdout.trim());
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
async function resolveWithProvider(editor, startLine) {
  const cfg = vscode8.workspace.getConfiguration("tonic");
  const provider = cfg.get("agent.provider", "clipboard") ?? "clipboard";
  const { prompt, line } = buildFullPrompt(editor, provider, startLine);
  if (provider === "clipboard" || provider === "cursor" || provider === "copilot") {
    await vscode8.env.clipboard.writeText(prompt);
    await vscode8.window.showInformationMessage(
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
    await vscode8.window.showInformationMessage(
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
  const uris = await vscode9.window.showOpenDialog({
    canSelectMany: false,
    openLabel: title
  });
  return uris?.[0];
}
function regionsJsonToCore2(regions) {
  return (regions ?? []).map((r) => ({
    baseContent: r.base_content ?? "",
    leftContent: r.left_content ?? "",
    rightContent: r.right_content ?? "",
    startLine: r.start_line,
    endLine: r.end_line,
    conflictKind: r.conflict_kind
  }));
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
      const uri = vscode9.Uri.file(last);
      await vscode9.workspace.fs.stat(uri);
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
    vscode9.languages.registerCodeLensProvider({ scheme: "file" }, codeLens)
  );
  context.subscriptions.push(
    vscode9.window.registerTreeDataProvider("tonic.conflicts", tree)
  );
  const refresh = () => {
    const ed = vscode9.window.activeTextEditor;
    if (ed && decorationTypes) {
      decorateDocument(ed, decorationTypes);
    }
    tree.setDocument(ed?.document);
    codeLens.refresh();
  };
  context.subscriptions.push(
    vscode9.window.onDidChangeActiveTextEditor(() => refresh())
  );
  context.subscriptions.push(
    vscode9.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode9.window.activeTextEditor?.document) {
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.keepLeft", async (line) => {
      const ed = vscode9.window.activeTextEditor;
      if (ed) {
        await keepLeft(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.keepRight", async (line) => {
      const ed = vscode9.window.activeTextEditor;
      if (ed) {
        await keepRight(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.keepBoth", async (line) => {
      const ed = vscode9.window.activeTextEditor;
      if (ed) {
        await keepBoth(ed, line ?? ed.selection.active.line);
        refresh();
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.acceptDeterministic", async () => {
      const leftUri = await pickOneFile("Left snapshot");
      if (!leftUri) {
        return;
      }
      const rightUri = await pickOneFile("Right snapshot");
      if (!rightUri) {
        return;
      }
      const leftBuf = await vscode9.workspace.fs.readFile(leftUri);
      const rightBuf = await vscode9.workspace.fs.readFile(rightUri);
      const left = normalizeFileLines(Buffer.from(leftBuf).toString("utf8"));
      const right = normalizeFileLines(Buffer.from(rightBuf).toString("utf8"));
      const [, annotated] = (0, import_core8.mergeSnapshots)(left, right);
      const doc = await vscode9.workspace.openTextDocument({
        content: annotated.join("\n"),
        language: "plaintext"
      });
      await vscode9.window.showTextDocument(doc, { preview: false });
      await vscode9.window.showInformationMessage(
        "Tonic: deterministic merge (from @mergetonic/core) opened as a new document with markers."
      );
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.openMergeEditor", async () => {
      const ed = vscode9.window.activeTextEditor;
      if (ed) {
        await openInMergeEditor(ed.document.uri);
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.resolveWithAgent", async (line) => {
      const ed = vscode9.window.activeTextEditor;
      if (!ed) {
        return;
      }
      try {
        await resolveWithProvider(ed, line ?? ed.selection.active.line);
        refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode9.window.showErrorMessage(`Tonic agent resolve failed: ${msg}`);
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.resolveWithAI", async (line) => {
      const ed = vscode9.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const blocks = (0, import_core8.parseTonicConflicts)(ed.document.getText());
      const b = blocks.find((x) => x.startLine === line) ?? blocks[0];
      if (!b) {
        await vscode9.window.showInformationMessage("Tonic: no conflict block found.");
        return;
      }
      const wsRel = vscode9.workspace.asRelativePath(ed.document.uri, false);
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
      await vscode9.env.clipboard.writeText(full);
      await vscode9.window.showInformationMessage(
        "Tonic: hydrated prompt copied \u2014 paste into Cursor / VS Code Chat (JSON output matches agent contract)."
      );
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.jumpNextConflict", () => {
      const ed = vscode9.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const blocks = (0, import_core8.parseTonicConflicts)(ed.document.getText());
      const cur = ed.selection.active.line;
      const next = blocks.find((b) => b.startLine > cur) ?? blocks[0];
      if (next) {
        const pos = new vscode9.Position(next.startLine, 0);
        ed.selection = new vscode9.Selection(pos, pos);
        ed.revealRange(new vscode9.Range(pos, pos));
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.jumpToLine", (ln) => {
      const ed = vscode9.window.activeTextEditor;
      if (ed) {
        const pos = new vscode9.Position(ln, 0);
        ed.selection = new vscode9.Selection(pos, pos);
        ed.revealRange(new vscode9.Range(pos, pos));
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.gitConflictsToTonicPreview", async () => {
      const ed = vscode9.window.activeTextEditor;
      if (!ed) {
        return;
      }
      const text = ed.document.getText();
      if (!(0, import_core8.hasGitConflictMarkers)(text)) {
        await vscode9.window.showInformationMessage("Tonic: no Git conflict markers in this file.");
        return;
      }
      const blocks = (0, import_core8.parseGitConflicts)(text);
      const lines = (0, import_core8.gitConflictBlocksToTonicAnnotatedPreview)(blocks);
      const doc = await vscode9.workspace.openTextDocument({
        content: lines.join("\n"),
        language: "plaintext"
      });
      await vscode9.window.showTextDocument(doc, { preview: true });
      await vscode9.window.showInformationMessage(
        "Tonic: opened Tonic-style preview from Git markers (read-only buffer)."
      );
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.applyMergeReportToWorkspace", async () => {
      const uris = await vscode9.window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] },
        openLabel: "Select merge report"
      });
      if (!uris?.[0]) {
        return;
      }
      let text;
      try {
        text = Buffer.from(await vscode9.workspace.fs.readFile(uris[0])).toString("utf8");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode9.window.showErrorMessage(`Tonic: could not read report: ${msg}`);
        return;
      }
      try {
        const report = parseMergeReportJson(text);
        const candidates = report.files.filter(
          (f) => f.markers_present && ((f.annotated_lines?.length ?? 0) > 0 || (f.conflict_regions?.length ?? 0) > 0)
        );
        if (!candidates.length) {
          await vscode9.window.showInformationMessage(
            "Tonic: no conflicted files with marker data in this report."
          );
          return;
        }
        const picked = await vscode9.window.showQuickPick(
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
        await vscode9.window.showErrorMessage(`Tonic: ${msg}`);
      }
    })
  );
  context.subscriptions.push(
    vscode9.commands.registerCommand("tonic.importMergeReport", async () => {
      const globHint = vscode9.workspace.getConfiguration("tonic").get("defaultReportGlob");
      const choice = await vscode9.window.showQuickPick(
        ["Open JSON file", "Paste JSON", "Re-open last report file"],
        {
          title: "Import Tonic merge report",
          placeHolder: globHint ? `Hint: ${globHint}` : void 0
        }
      );
      let text;
      if (choice === "Open JSON file") {
        const defaultUri = await tryOpenLastReportPath();
        const uris = await vscode9.window.showOpenDialog({
          canSelectMany: false,
          defaultUri: defaultUri ?? void 0,
          filters: { JSON: ["json"] },
          openLabel: "Import"
        });
        if (!uris?.length) {
          return;
        }
        await context.workspaceState.update("tonic.lastReportJsonPath", uris[0].fsPath);
        text = Buffer.from(await vscode9.workspace.fs.readFile(uris[0])).toString("utf8");
      } else if (choice === "Re-open last report file") {
        const uri = await tryOpenLastReportPath();
        if (!uri) {
          await vscode9.window.showInformationMessage("Tonic: no saved report path for this workspace.");
          return;
        }
        text = Buffer.from(await vscode9.workspace.fs.readFile(uri)).toString("utf8");
      } else if (choice === "Paste JSON") {
        text = await vscode9.window.showInputBox({
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
          const legPick = await vscode9.window.showQuickPick(
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
          await vscode9.window.showInformationMessage(msg);
          return;
        }
        let picked;
        if (items.length === 1) {
          picked = items[0];
        } else {
          const multi = await vscode9.window.showQuickPick(items, {
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
          const regions = regionsJsonToCore2(picked.artifact.conflict_regions);
          body = (0, import_core8.conflictRegionsToAnnotatedLines)(regions).join("\n");
        } else {
          body = picked.artifact.annotated_lines.join("\n");
        }
        setLastImportedArtifact(report, picked.artifact);
        const doc = await vscode9.workspace.openTextDocument({
          content: body,
          language: "plaintext"
        });
        await vscode9.window.showTextDocument(doc, { preview: true });
        await vscode9.window.showInformationMessage(
          `Tonic: opened ${picked.reconstructed ? "reconstructed" : "annotated"} output for ${picked.label} (left=base, right=head).`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await vscode9.window.showErrorMessage(`Tonic import failed: ${msg}`);
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
