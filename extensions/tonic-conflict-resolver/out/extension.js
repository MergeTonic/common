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
      return { path, conflicts, content: text, leftLabel: "left", rightLabel: "right" };
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
    function conflictFileFromBlocks(path, text, blocks) {
      return {
        path,
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
    var authorAliasResolver_1 = require_authorAliasResolver();
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
    var fs = __importStar(require("node:fs"));
    var path = __importStar(require("node:path"));
    var readline = __importStar(require("node:readline/promises"));
    var markerInterop_1 = require_markerInterop();
    exports2.DEFAULT_INTENT_PROFILE_PATH = ".tonic/intent-profile.json";
    function loadIntentProfile(filePath) {
      try {
        const raw = fs.readFileSync(filePath, "utf8");
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
      const abs = path.resolve(filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify({ version: 1, leftIntent: profile.leftIntent, rightIntent: profile.rightIntent }, null, 2) + "\n", "utf8");
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

// ../../packages/tonic-core/dist/hydration/types.js
var require_types = __commonJS({
  "../../packages/tonic-core/dist/hydration/types.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HYDRATION_OPTIONAL_AI_EXIT_CODE = exports2.HYDRATION_PIPELINE_VERSION = exports2.HYDRATION_PIPELINE_SCHEMA = exports2.HYDRATION_INTENT_RESULT_SCHEMA = void 0;
    exports2.HYDRATION_INTENT_RESULT_SCHEMA = "tonic-intent-hydration";
    exports2.HYDRATION_PIPELINE_SCHEMA = "tonic-hydration-pipeline";
    exports2.HYDRATION_PIPELINE_VERSION = "1";
    exports2.HYDRATION_OPTIONAL_AI_EXIT_CODE = 5;
  }
});

// ../../packages/tonic-core/dist/hydration/errors.js
var require_errors = __commonJS({
  "../../packages/tonic-core/dist/hydration/errors.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HydrationPersistError = exports2.OptionalAiDependencyError = exports2.HydrationRuntimeError = void 0;
    var HydrationRuntimeError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "HydrationRuntimeError";
      }
    };
    exports2.HydrationRuntimeError = HydrationRuntimeError;
    var OptionalAiDependencyError = class extends HydrationRuntimeError {
      constructor(message) {
        super(message);
        this.name = "OptionalAiDependencyError";
      }
    };
    exports2.OptionalAiDependencyError = OptionalAiDependencyError;
    var HydrationPersistError = class extends HydrationRuntimeError {
      constructor(message) {
        super(message);
        this.name = "HydrationPersistError";
      }
    };
    exports2.HydrationPersistError = HydrationPersistError;
  }
});

// ../../packages/tonic-core/dist/hydration/chromaClient.js
var require_chromaClient = __commonJS({
  "../../packages/tonic-core/dist/hydration/chromaClient.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.loadHydrationChromaModule = loadHydrationChromaModule;
    exports2.parseHydrationChromaUrl = parseHydrationChromaUrl;
    exports2.probeHydrationChromaHeartbeat = probeHydrationChromaHeartbeat;
    exports2.createHydrationChromaClient = createHydrationChromaClient;
    exports2.getHydrationChromaCollection = getHydrationChromaCollection;
    var errors_1 = require_errors();
    async function loadHydrationChromaModule() {
      try {
        const req = Function("return require")();
        return req("chromadb");
      } catch {
        throw new errors_1.OptionalAiDependencyError("Optional AI dependency 'chromadb' is required for Chroma-backed hydration. Install the repo AI extras before using TONIC_CHROMA_MODE=http.");
      }
    }
    function parseHydrationChromaUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(rawUrl);
      } catch {
        throw new errors_1.HydrationRuntimeError(`Invalid TONIC_CHROMA_URL: ${rawUrl}`);
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new errors_1.HydrationRuntimeError(`TONIC_CHROMA_URL must use http or https. Received: ${rawUrl}`);
      }
      return {
        raw: rawUrl,
        origin: parsed.origin,
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80,
        ssl: parsed.protocol === "https:",
        pathname: parsed.pathname || "/"
      };
    }
    async function probeHydrationChromaHeartbeat(config, opts = {}) {
      const parsed = parseHydrationChromaUrl(config.url);
      const heartbeatUrl = new URL(config.heartbeatPath, `${parsed.origin}/`).toString();
      const fetchImpl = opts.fetchImpl ?? fetch;
      try {
        const response = await fetchImpl(heartbeatUrl, {
          method: "GET",
          signal: AbortSignal.timeout(opts.timeoutMs ?? 3e3)
        });
        return {
          ok: response.ok,
          status: response.status,
          heartbeatUrl,
          error: response.ok ? void 0 : `HTTP ${response.status}`
        };
      } catch (error) {
        return {
          ok: false,
          heartbeatUrl,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    async function createHydrationChromaClient(config) {
      if (config.mode !== "http") {
        throw new errors_1.HydrationRuntimeError(`TypeScript hydration Chroma vendoring supports only HTTP mode. Received TONIC_CHROMA_MODE=${config.mode}. Use TONIC_CHROMA_MODE=http or TONIC_CHROMA_MODE=memory in TS.`);
      }
      const mod = await loadHydrationChromaModule();
      return new mod.ChromaClient({ path: config.url });
    }
    async function getHydrationChromaCollection(config) {
      const client = await createHydrationChromaClient(config);
      return client.getOrCreateCollection({
        name: config.collectionName,
        metadata: {
          "tonic.collection": config.collectionName,
          "tonic.persist_path": config.persistPath
        }
      });
    }
  }
});

// ../../packages/tonic-core/dist/hydration/prompts/hydrationPrompts.v1.json
var require_hydrationPrompts_v1 = __commonJS({
  "../../packages/tonic-core/dist/hydration/prompts/hydrationPrompts.v1.json"(exports2, module2) {
    module2.exports = {
      schema_version: 1,
      question_generation: {
        system: "You are planning retrieval questions for Tonic intent hydration. Generate concise, named questions that help infer stable conflict intent from repository evidence. Prefer precise, reusable prompts over verbose prose, and plan from higher-level architecture toward lower-level symbols.",
        user: "Repository root: {repo_root}\nScope: {scope}\nDownstream task: {downstream_task}\nBranch intents:\n{branch_intents}\n\nHydrated context already available:\n{hydrated_context}\n\nPlan up to {max_questions} named retrieval questions for guided LLM meta-generation. Reuse or refine prior questions when useful instead of starting over.\nPrior questions:\n{prior_questions}\n\nReturn structured question slots with short identifiers and concise question text."
      },
      retrieval_slot_user: "Question slot {slot_id}: {question}\nSummarize the most relevant repository evidence, emphasizing files, symbols, or commits that answer this question.",
      synthesis: {
        system: "You are synthesizing Tonic intent hydration results. Produce short, precise intent markers plus concise rationale grounded in the provided retrieval evidence and AST candidates.",
        user: "Repository root: {repo_root}\nConflict path: {path}\nIntent spec:\n{intent_spec}\n\nQuestion slots:\n{question_slots}\n\nRetrieval bundles:\n{retrieval_bundles}\n\nFuzzy AST alignment candidates:\n{fuzzy_alignment}\n\nReturn a compact machine-friendly intent result with precise short tags and a brief rationale."
      }
    };
  }
});

// ../../packages/tonic-core/dist/hydration/prompts/conflictPrompts.v1.json
var require_conflictPrompts_v1 = __commonJS({
  "../../packages/tonic-core/dist/hydration/prompts/conflictPrompts.v1.json"(exports2, module2) {
    module2.exports = {
      schema_version: 1,
      github_json_response_suffix: '\n\nYou MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines": ["each line of the merged result"], "rationale": "one short sentence"}. Each element of resolved_lines must be one logical line of the file (no embedded newlines).',
      system_prompts: {
        default: "You are an expert software developer helping to resolve merge conflicts described with Tonic semantic markers (left vs right, added/deleted/both). Analyze the provided regions and resolve them in a way that preserves the intent of both sides whenever possible. Consider the whole file and follow existing style. Provide clean resolved content without conflict markers.",
        enhanced: "You are an expert software developer specializing in Tonic-style merge conflicts. Your task is to analyze regions labeled with left/right and conflict kinds (added left, deleted right, etc.) and resolve them with semantic understanding.\n\n1. Interpret both sides by meaning, not only by text diff\n2. Preserve functional changes from both sides when possible\n3. Prefer correctness and program logic over naive text merging\n4. Follow the codebase style\n5. Consider edge cases and side effects\n6. If sides are incompatible, choose reasonably and explain only if asked\n\nProvide only cleanly resolved code without conflict markers unless requested.",
        context_aware: "You are an expert software developer specializing in Tonic merge conflicts. Compare left and right to BASE when provided; use surrounding file context. Preserve intent from both sides, prioritize correctness, follow project style, combine complementary edits, and when BASE is present use it to understand what each side changed. Provide only resolved code without markers unless asked."
      },
      conflict_user: {
        default: "I need help resolving a Tonic merge conflict in the file: {path}\n\nThe file contains a conflict between line {start_line} and {end_line}{kind_suffix}:\n\nLEFT ({left_label}):\n```\n{left_content}```\n\nRIGHT ({right_label}):\n```\n{right_content}```\n\nResolve this conflict and provide only the final content that should replace the conflicting region. Preserve both sides' intent when possible. Do not include Tonic or Git conflict markers in your response.",
        enhanced: "I need help resolving a Tonic merge conflict in the file: {path}\n\nCONFLICT DETAILS:\n- Location: Lines {start_line} to {end_line}\n- Tonic kind: {kind}\n- File type: {file_type}\n\nLEFT ({left_label}):\n```\n{left_content}```\n\nRIGHT ({right_label}):\n```\n{right_content}```\n\nCONFLICT ANALYSIS:\nAnalyze semantic differences. Look for complementary changes, incompatible edits, and what each side is trying to accomplish.\n\nRESOLUTION:\nProvide ONLY the final resolved code for this region. No markers or explanations.",
        context_aware: "I need help resolving a Tonic merge conflict in the file: {path}\n\nCONFLICT DETAILS:\n- Lines {start_line} to {end_line}\n- Kind: {kind}\n- File type: {file_type}\n\n{base_section}{ctx_section}LEFT ({left_label}):\n```\n{left_content}```\n\nRIGHT ({right_label}):\n```\n{right_content}```\n\nProvide ONLY the final resolved code for this region, integrating with context."
      },
      file_user: {
        default: "I need help resolving Tonic merge conflicts in the file: {path}\n\nThe file has {conflict_count} conflict(s):\n\n{conflicts_body}Provide the entire resolved file content. Preserve intent from both sides when possible. Do not include conflict markers in your response.",
        enhanced: "I need help resolving Tonic merge conflicts in: {path}\n\nFILE DETAILS:\n- File type: {file_type}\n- Conflicts: {conflict_count}\n\nCONFLICTS:\n\n{conflicts_body}Provide ONLY the complete resolved file. No markers or commentary.",
        context_aware: "I need help resolving Tonic merge conflicts in: {path}\n\nFILE DETAILS:\n- File type: {file_type}\n- Conflicts: {conflict_count}\n\nCONFLICTS:\n\n{conflicts_body}Compare to BASE per region when present; produce one coherent resolved file."
      }
    };
  }
});

// ../../packages/tonic-core/dist/hydration/promptBundle.js
var require_promptBundle = __commonJS({
  "../../packages/tonic-core/dist/hydration/promptBundle.js"(exports2) {
    "use strict";
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.loadHydrationPrompts = loadHydrationPrompts;
    exports2.loadConflictPrompts = loadConflictPrompts;
    exports2.formatHydrationPromptTemplate = formatHydrationPromptTemplate;
    exports2.buildGuidedQuestionGenerationPrompt = buildGuidedQuestionGenerationPrompt;
    exports2.buildHydrationSynthesisPrompt = buildHydrationSynthesisPrompt;
    var hydrationPrompts_v1_json_1 = __importDefault(require_hydrationPrompts_v1());
    var conflictPrompts_v1_json_1 = __importDefault(require_conflictPrompts_v1());
    var bundle = hydrationPrompts_v1_json_1.default;
    var conflictBundle = conflictPrompts_v1_json_1.default;
    function loadHydrationPrompts() {
      return bundle;
    }
    function loadConflictPrompts() {
      return conflictBundle;
    }
    function formatHydrationPromptTemplate(template, vars) {
      return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key) => Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : `{${key}}`);
    }
    function buildGuidedQuestionGenerationPrompt(vars) {
      const prompts = loadHydrationPrompts();
      return {
        system: prompts.question_generation.system,
        user: formatHydrationPromptTemplate(prompts.question_generation.user, {
          repo_root: vars.repo_root,
          scope: vars.scope,
          downstream_task: vars.downstream_task,
          branch_intents: vars.branch_intents,
          max_questions: vars.max_questions,
          prior_questions: vars.prior_questions ?? "(none)",
          hydrated_context: vars.hydrated_context ?? "(none)"
        })
      };
    }
    function buildHydrationSynthesisPrompt(vars) {
      const prompts = loadHydrationPrompts();
      return {
        system: prompts.synthesis.system,
        user: formatHydrationPromptTemplate(prompts.synthesis.user, vars)
      };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/chunker.js
var require_chunker = __commonJS({
  "../../packages/tonic-core/dist/hydration/chunker.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.LineTokenEstimateChunker = void 0;
    var node_crypto_1 = require("node:crypto");
    function estimateTokens(text) {
      const trimmed = text.trim();
      if (!trimmed) {
        return 0;
      }
      return Math.max(1, Math.ceil(trimmed.length / 4));
    }
    function chunkId(path, startLine, endLine, document) {
      const digest = (0, node_crypto_1.createHash)("sha256").update(path, "utf8").update("").update(String(startLine), "utf8").update("").update(String(endLine), "utf8").update("").update(document, "utf8").digest("hex").slice(0, 16);
      return `${path}:${startLine}-${endLine}:${digest}`;
    }
    var LineTokenEstimateChunker = class {
      maxLinesPerChunk;
      maxEstimatedTokens;
      version = "line-estimate-v1";
      constructor(config = {}) {
        this.maxLinesPerChunk = config.maxLinesPerChunk ?? 80;
        this.maxEstimatedTokens = config.maxEstimatedTokens ?? 600;
      }
      chunkText(path, content) {
        const lines = content.split(/\r?\n/);
        const chunks = [];
        let start = 0;
        while (start < lines.length) {
          let end = start;
          let currentTokens = 0;
          while (end < lines.length) {
            const candidate = lines.slice(start, end + 1).join("\n");
            const estimated = estimateTokens(candidate);
            const candidateLineCount = end - start + 1;
            if (end > start && (candidateLineCount > this.maxLinesPerChunk || estimated > this.maxEstimatedTokens)) {
              break;
            }
            currentTokens = estimated;
            end += 1;
          }
          const document = lines.slice(start, end).join("\n");
          const startLine = start + 1;
          const endLine = Math.max(startLine, end);
          chunks.push({
            id: chunkId(path, startLine, endLine, document),
            path,
            startLine,
            endLine,
            document,
            estimatedTokens: currentTokens
          });
          start = end;
        }
        return chunks.filter((chunk) => chunk.document.length > 0);
      }
    };
    exports2.LineTokenEstimateChunker = LineTokenEstimateChunker;
  }
});

// ../../packages/tonic-core/dist/hydration/embedder.js
var require_embedder = __commonJS({
  "../../packages/tonic-core/dist/hydration/embedder.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DeterministicFakeEmbedder = void 0;
    var node_crypto_1 = require("node:crypto");
    function deterministicEmbedding(text, dimensions) {
      const hash = (0, node_crypto_1.createHash)("sha256").update(text, "utf8").digest();
      const values = new Array(dimensions).fill(0);
      for (let i = 0; i < dimensions; i++) {
        const a = hash[i % hash.length] ?? 0;
        const b = hash[(i + 7) % hash.length] ?? 0;
        values[i] = (a + b) / 255 - 1;
      }
      return values;
    }
    var DeterministicFakeEmbedder = class {
      modelId;
      dimensions;
      constructor(params = {}) {
        this.modelId = params.modelId ?? "deterministic-fake-v1";
        this.dimensions = params.dimensions ?? 16;
      }
      async embedDocuments(texts) {
        return texts.map((text) => deterministicEmbedding(text, this.dimensions));
      }
      async embedQuery(text) {
        return deterministicEmbedding(text, this.dimensions);
      }
    };
    exports2.DeterministicFakeEmbedder = DeterministicFakeEmbedder;
  }
});

// ../../packages/tonic-core/dist/hydration/indexState.js
var require_indexState = __commonJS({
  "../../packages/tonic-core/dist/hydration/indexState.js"(exports2) {
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
    exports2.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION = exports2.HYDRATION_INDEX_STATE_SCHEMA = void 0;
    exports2.createHydrationIndexState = createHydrationIndexState;
    exports2.loadHydrationIndexState = loadHydrationIndexState;
    exports2.saveHydrationIndexState = saveHydrationIndexState;
    exports2.isHydrationIndexStateCompatible = isHydrationIndexStateCompatible;
    var fs = __importStar(require("node:fs"));
    var path = __importStar(require("node:path"));
    var types_1 = require_types();
    exports2.HYDRATION_INDEX_STATE_SCHEMA = "tonic-hydration-index-state";
    exports2.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION = "1";
    function createHydrationIndexState(params) {
      return {
        schema: exports2.HYDRATION_INDEX_STATE_SCHEMA,
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        compatibility_version: exports2.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION,
        collection_name: params.collectionName,
        vector_backend: params.vectorBackend,
        embedder_model: params.embedderModel,
        chunker_version: params.chunkerVersion,
        strategy_id: params.strategyId,
        repo_root: params.repoRoot,
        cache_key: params.cacheKey,
        pr_scope_hash: params.prScopeHash,
        normative_commit: params.normativeCommit,
        updated_at: (/* @__PURE__ */ new Date()).toISOString(),
        indexed_files: params.indexedFiles ?? {}
      };
    }
    function loadHydrationIndexState(filePath) {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return {
        schema: exports2.HYDRATION_INDEX_STATE_SCHEMA,
        pipeline_version: parsed.pipeline_version ?? types_1.HYDRATION_PIPELINE_VERSION,
        compatibility_version: parsed.compatibility_version ?? exports2.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION,
        collection_name: parsed.collection_name ?? "",
        vector_backend: parsed.vector_backend ?? "",
        embedder_model: parsed.embedder_model ?? "",
        chunker_version: parsed.chunker_version ?? "",
        strategy_id: parsed.strategy_id ?? "",
        repo_root: parsed.repo_root ?? "",
        cache_key: parsed.cache_key,
        pr_scope_hash: parsed.pr_scope_hash,
        normative_commit: parsed.normative_commit,
        updated_at: parsed.updated_at ?? "",
        indexed_files: parsed.indexed_files ?? {}
      };
    }
    function saveHydrationIndexState(filePath, state) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
    }
    function isHydrationIndexStateCompatible(state, params) {
      if (!state) {
        return false;
      }
      return state.schema === exports2.HYDRATION_INDEX_STATE_SCHEMA && state.compatibility_version === exports2.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION && state.collection_name === params.collectionName && state.vector_backend === params.vectorBackend && state.embedder_model === params.embedderModel && state.chunker_version === params.chunkerVersion && state.strategy_id === params.strategyId && state.repo_root === params.repoRoot && (params.cacheKey ? state.cache_key === params.cacheKey : true);
    }
  }
});

// ../../packages/tonic-core/dist/hydration/llmTranscript.js
var require_llmTranscript = __commonJS({
  "../../packages/tonic-core/dist/hydration/llmTranscript.js"(exports2) {
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
    exports2.appendHydrationLlmTranscriptEvent = appendHydrationLlmTranscriptEvent;
    var fs = __importStar(require("node:fs"));
    var path = __importStar(require("node:path"));
    function resolveTranscriptPath(run) {
      return run.artifacts.llm_transcript_path ?? path.join(path.dirname(run.artifacts.run_state_path), "llm.jsonl");
    }
    function appendHydrationLlmTranscriptEvent(run, event) {
      const targetPath = resolveTranscriptPath(run);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const payload = {
        ts: event.ts ?? (/* @__PURE__ */ new Date()).toISOString(),
        ...event
      };
      fs.appendFileSync(targetPath, JSON.stringify(payload) + "\n", "utf8");
      run.artifacts.llm_transcript_path = targetPath;
      return targetPath;
    }
  }
});

// ../../packages/tonic-core/dist/hydration/paths.js
var require_paths = __commonJS({
  "../../packages/tonic-core/dist/hydration/paths.js"(exports2) {
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
    exports2.DEFAULT_INDEX_STATE_FILE_NAME = exports2.DEFAULT_HYDRATION_RUNS_DIR_NAME = exports2.DEFAULT_CHROMA_DIR_NAME = exports2.DEFAULT_TONIC_DIR_NAME = void 0;
    exports2.resolveHydrationArtifactPaths = resolveHydrationArtifactPaths;
    var path = __importStar(require("node:path"));
    exports2.DEFAULT_TONIC_DIR_NAME = ".tonic";
    exports2.DEFAULT_CHROMA_DIR_NAME = "chroma_db";
    exports2.DEFAULT_HYDRATION_RUNS_DIR_NAME = "hydration-runs";
    exports2.DEFAULT_INDEX_STATE_FILE_NAME = "index-state.json";
    function resolveHydrationArtifactPaths(repoRoot, opts = {}) {
      const tonicRoot = path.resolve(repoRoot, opts.tonicDirName ?? exports2.DEFAULT_TONIC_DIR_NAME);
      const persistRoot = path.join(tonicRoot, opts.chromaDirName ?? exports2.DEFAULT_CHROMA_DIR_NAME);
      const runRoot = path.join(tonicRoot, opts.runDirName ?? exports2.DEFAULT_HYDRATION_RUNS_DIR_NAME);
      const indexStatePath = path.join(persistRoot, opts.indexStateFileName ?? exports2.DEFAULT_INDEX_STATE_FILE_NAME);
      return {
        persistRoot,
        runRoot,
        indexStatePath
      };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/persistence.js
var require_persistence = __commonJS({
  "../../packages/tonic-core/dist/hydration/persistence.js"(exports2) {
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
    exports2.HYDRATION_CACHE_KEY_SCHEMA_VERSION = exports2.HYDRATION_PERSIST_LOCK_FILE_NAME = exports2.HYDRATION_PERSIST_MANIFEST_FILE_NAME = exports2.HYDRATION_PERSIST_MANIFEST_SCHEMA = void 0;
    exports2.buildHydrationCacheKey = buildHydrationCacheKey;
    exports2.resolveHydrationPersistManifestPath = resolveHydrationPersistManifestPath;
    exports2.writeHydrationPersistManifest = writeHydrationPersistManifest;
    exports2.loadHydrationPersistManifest = loadHydrationPersistManifest;
    exports2.checkHydrationPersistHealth = checkHydrationPersistHealth;
    exports2.assertHydrationPersistHealth = assertHydrationPersistHealth;
    exports2.acquireHydrationPersistLock = acquireHydrationPersistLock;
    var node_crypto_1 = require("node:crypto");
    var fs = __importStar(require("node:fs"));
    var path = __importStar(require("node:path"));
    var types_1 = require_types();
    var paths_1 = require_paths();
    var errors_1 = require_errors();
    exports2.HYDRATION_PERSIST_MANIFEST_SCHEMA = "tonic-hydration-persist-manifest";
    exports2.HYDRATION_PERSIST_MANIFEST_FILE_NAME = "persist-manifest.json";
    exports2.HYDRATION_PERSIST_LOCK_FILE_NAME = ".writer.lock";
    exports2.HYDRATION_CACHE_KEY_SCHEMA_VERSION = "1";
    function normalizePrIdentifiers(values) {
      return [...values ?? []].map((value) => value.trim()).filter(Boolean).sort();
    }
    function listPersistEntries(persistRoot) {
      if (!fs.existsSync(persistRoot)) {
        return [];
      }
      return fs.readdirSync(persistRoot).sort();
    }
    function hasStoreFiles(entries) {
      return entries.some((entry) => ![
        paths_1.DEFAULT_INDEX_STATE_FILE_NAME,
        exports2.HYDRATION_PERSIST_MANIFEST_FILE_NAME,
        exports2.HYDRATION_PERSIST_LOCK_FILE_NAME
      ].includes(entry));
    }
    function buildHydrationCacheKey(parts) {
      const prIdentifiers = normalizePrIdentifiers(parts.prIdentifiers);
      const prListHash = (0, node_crypto_1.createHash)("sha256").update(prIdentifiers.join("\n"), "utf8").digest("hex");
      const payload = {
        schema_version: exports2.HYDRATION_CACHE_KEY_SCHEMA_VERSION,
        strategy_id: parts.strategyId,
        pr_list_hash: prListHash,
        embedder_model: parts.embedderModel,
        chunker_version: parts.chunkerVersion
      };
      return {
        cacheKey: (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(payload), "utf8").digest("hex"),
        prListHash,
        payload
      };
    }
    function resolveHydrationPersistManifestPath(persistRoot) {
      return path.join(persistRoot, exports2.HYDRATION_PERSIST_MANIFEST_FILE_NAME);
    }
    function writeHydrationPersistManifest(params) {
      fs.mkdirSync(params.persistRoot, { recursive: true });
      const manifestPath = resolveHydrationPersistManifestPath(params.persistRoot);
      const entries = listPersistEntries(params.persistRoot).filter((entry) => entry !== exports2.HYDRATION_PERSIST_LOCK_FILE_NAME);
      const manifest = {
        schema: exports2.HYDRATION_PERSIST_MANIFEST_SCHEMA,
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        persist_root: params.persistRoot,
        index_state_file: params.indexStateFile ?? paths_1.DEFAULT_INDEX_STATE_FILE_NAME,
        writer_kind: params.writerKind,
        cache_key: params.cacheKey,
        entries,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      return manifest;
    }
    function loadHydrationPersistManifest(persistRoot) {
      const manifestPath = resolveHydrationPersistManifestPath(persistRoot);
      if (!fs.existsSync(manifestPath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    function checkHydrationPersistHealth(persistRoot) {
      const manifestPath = resolveHydrationPersistManifestPath(persistRoot);
      const entries = listPersistEntries(persistRoot);
      const indexStateFile = paths_1.DEFAULT_INDEX_STATE_FILE_NAME;
      const hasIndexState = entries.includes(indexStateFile);
      const storeFilesPresent = hasStoreFiles(entries);
      if (entries.length === 0) {
        return {
          ok: true,
          coldStart: true,
          hasIndexState: false,
          hasStoreFiles: false,
          entries,
          manifestPath
        };
      }
      if (storeFilesPresent && !hasIndexState) {
        return {
          ok: false,
          coldStart: false,
          hasIndexState,
          hasStoreFiles: storeFilesPresent,
          entries,
          manifestPath,
          reason: "Persist root has Chroma files but no index-state.json. Restore the full tree or rebuild the cache."
        };
      }
      const manifest = loadHydrationPersistManifest(persistRoot);
      if (!manifest) {
        return {
          ok: !storeFilesPresent && !hasIndexState,
          coldStart: !storeFilesPresent && !hasIndexState,
          hasIndexState,
          hasStoreFiles: storeFilesPresent,
          entries,
          manifestPath,
          reason: storeFilesPresent || hasIndexState ? "Persist root is missing persist-manifest.json. Rebuild the persisted Chroma tree instead of restoring partial files." : void 0
        };
      }
      const missingEntries = manifest.entries.filter((entry) => !fs.existsSync(path.join(persistRoot, entry)));
      if (missingEntries.length > 0) {
        return {
          ok: false,
          coldStart: false,
          hasIndexState,
          hasStoreFiles: storeFilesPresent,
          entries,
          manifestPath,
          missingEntries,
          reason: `Persist root is missing required entries from ${exports2.HYDRATION_PERSIST_MANIFEST_FILE_NAME}. Restore the full tree or rebuild the cache.`
        };
      }
      return {
        ok: true,
        coldStart: false,
        hasIndexState,
        hasStoreFiles: storeFilesPresent,
        entries,
        manifestPath
      };
    }
    function assertHydrationPersistHealth(persistRoot) {
      const health = checkHydrationPersistHealth(persistRoot);
      if (!health.ok) {
        throw new errors_1.HydrationPersistError(health.reason ?? "Hydration persist root is not safe to reuse.");
      }
      return health;
    }
    function acquireHydrationPersistLock(persistRoot, owner) {
      fs.mkdirSync(persistRoot, { recursive: true });
      const lockPath = path.join(persistRoot, exports2.HYDRATION_PERSIST_LOCK_FILE_NAME);
      const token = (0, node_crypto_1.randomUUID)();
      const payload = {
        owner,
        token,
        pid: process.pid,
        acquired_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      try {
        const fd = fs.openSync(lockPath, "wx");
        try {
          fs.writeFileSync(fd, JSON.stringify(payload, null, 2) + "\n", "utf8");
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        let detail = "";
        if (fs.existsSync(lockPath)) {
          detail = fs.readFileSync(lockPath, "utf8").trim();
        }
        throw new errors_1.HydrationPersistError(`Hydration persist root is already claimed by another writer at ${lockPath}.${detail ? ` Existing lock: ${detail}` : ""}`);
      }
      return {
        lockPath,
        token,
        release() {
          if (!fs.existsSync(lockPath)) {
            return;
          }
          try {
            const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
            if (current.token !== token) {
              return;
            }
          } catch {
            return;
          }
          fs.unlinkSync(lockPath);
        }
      };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/repository.js
var require_repository = __commonJS({
  "../../packages/tonic-core/dist/hydration/repository.js"(exports2) {
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
    exports2.HydrationRepository = void 0;
    var node_child_process_1 = require("node:child_process");
    var node_crypto_1 = require("node:crypto");
    var fs = __importStar(require("node:fs"));
    var path = __importStar(require("node:path"));
    var DEFAULT_DENY_PATH_PREFIXES = [
      ".git/",
      ".tonic/",
      "node_modules/",
      "__pycache__/"
    ];
    var SECRET_FILE_PATTERN = /(^|\/)(\.env($|\.)|id_rsa($|\.)|id_ed25519($|\.)|.*\.(pem|key|p12|pfx|crt|der|cer))$/i;
    function normalizeRelativePath(filePath) {
      return filePath.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
    }
    function splitZeroTerminatedBuffer(buffer) {
      return buffer.toString("utf8").split("\0").map((part) => part.trim()).filter((part) => part.length > 0);
    }
    function hashContent(content) {
      return (0, node_crypto_1.createHash)("sha256").update(content, "utf8").digest("hex");
    }
    function looksLikeText(buffer) {
      for (const byte of buffer.values()) {
        if (byte === 0) {
          return false;
        }
      }
      return true;
    }
    function shouldIgnorePath(relativePath, denyPathPrefixes) {
      const normalized = normalizeRelativePath(relativePath);
      if (!normalized || SECRET_FILE_PATTERN.test(normalized)) {
        return true;
      }
      return denyPathPrefixes.some((prefix) => normalized.startsWith(prefix));
    }
    function walkFallback(repoRoot, denyPathPrefixes) {
      const out = [];
      const stack = [repoRoot];
      while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const absolutePath = path.join(current, entry.name);
          const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath));
          if (shouldIgnorePath(relativePath, denyPathPrefixes)) {
            continue;
          }
          if (entry.isDirectory()) {
            stack.push(absolutePath);
            continue;
          }
          if (entry.isFile()) {
            out.push(relativePath);
          }
        }
      }
      return out.sort();
    }
    var HydrationRepository = class {
      repoRoot;
      denyPathPrefixes;
      maxFileBytes;
      constructor(repoRoot, options = {}) {
        this.repoRoot = path.resolve(repoRoot);
        this.denyPathPrefixes = [
          ...DEFAULT_DENY_PATH_PREFIXES,
          ...(options.denyPathPrefixes ?? []).map((entry) => normalizeRelativePath(entry))
        ];
        this.maxFileBytes = options.maxFileBytes ?? 512 * 1024;
      }
      listIndexablePaths() {
        try {
          const output = (0, node_child_process_1.execFileSync)("git", ["-C", this.repoRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
            encoding: "buffer",
            stdio: ["ignore", "pipe", "ignore"]
          });
          return splitZeroTerminatedBuffer(output).map((entry) => normalizeRelativePath(entry)).filter((entry) => !shouldIgnorePath(entry, this.denyPathPrefixes)).filter((entry) => {
            const absolutePath = path.join(this.repoRoot, entry);
            return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
          }).sort();
        } catch {
          return walkFallback(this.repoRoot, this.denyPathPrefixes);
        }
      }
      readIndexableFiles() {
        const files = [];
        for (const relativePath of this.listIndexablePaths()) {
          const absolutePath = path.join(this.repoRoot, relativePath);
          const buffer = fs.readFileSync(absolutePath);
          if (buffer.byteLength > this.maxFileBytes || !looksLikeText(buffer)) {
            continue;
          }
          const content = buffer.toString("utf8");
          files.push({
            relativePath,
            absolutePath,
            content,
            contentHash: hashContent(content),
            sizeBytes: buffer.byteLength
          });
        }
        return files;
      }
    };
    exports2.HydrationRepository = HydrationRepository;
  }
});

// ../../packages/tonic-core/dist/hydration/indexer.js
var require_indexer = __commonJS({
  "../../packages/tonic-core/dist/hydration/indexer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HydrationIndexer = void 0;
    var indexState_1 = require_indexState();
    var paths_1 = require_paths();
    var persistence_1 = require_persistence();
    var repository_1 = require_repository();
    var chunker_1 = require_chunker();
    function allChunkIds(state) {
      return Object.values(state?.indexed_files ?? {}).flatMap((entry) => entry.chunk_ids);
    }
    var HydrationIndexer = class {
      repoRoot;
      index;
      embedder;
      chunker;
      strategyId;
      repository;
      constructor(repoRoot, index, embedder, options = {}) {
        this.repoRoot = repoRoot;
        this.index = index;
        this.embedder = embedder;
        this.chunker = options.chunker ?? new chunker_1.LineTokenEstimateChunker();
        this.strategyId = options.strategyId ?? "incremental-content-hash";
        this.repository = options.repository ?? new repository_1.HydrationRepository(repoRoot);
      }
      async sync(params) {
        const artifactPaths = (0, paths_1.resolveHydrationArtifactPaths)(this.repoRoot);
        (0, persistence_1.assertHydrationPersistHealth)(artifactPaths.persistRoot);
        const previousState = (0, indexState_1.loadHydrationIndexState)(artifactPaths.indexStatePath);
        const compatible = (0, indexState_1.isHydrationIndexStateCompatible)(previousState, {
          collectionName: this.index.collectionName,
          vectorBackend: params.vectorBackend,
          embedderModel: this.embedder.modelId,
          chunkerVersion: this.chunker.version,
          strategyId: this.strategyId,
          repoRoot: this.repoRoot,
          cacheKey: params.cacheKey
        });
        if (!compatible) {
          const staleIds = allChunkIds(previousState);
          if (staleIds.length > 0) {
            await this.index.delete({ ids: staleIds });
          }
        }
        const previousFiles = compatible ? previousState?.indexed_files ?? {} : {};
        const nextFiles = {};
        const repoFiles = this.repository.readIndexableFiles();
        const currentPaths = new Set(repoFiles.map((file) => file.relativePath));
        let addedFiles = 0;
        let updatedFiles = 0;
        let unchangedFiles = 0;
        let indexedChunks = 0;
        let deletedChunks = compatible ? 0 : allChunkIds(previousState).length;
        for (const [relativePath, entry] of Object.entries(previousFiles)) {
          if (!currentPaths.has(relativePath) && entry.chunk_ids.length > 0) {
            await this.index.delete({ ids: entry.chunk_ids });
            deletedChunks += entry.chunk_ids.length;
          }
        }
        for (const file of repoFiles) {
          const previousEntry = previousFiles[file.relativePath];
          if (previousEntry && previousEntry.content_hash === file.contentHash) {
            nextFiles[file.relativePath] = previousEntry;
            unchangedFiles += 1;
            continue;
          }
          if (previousEntry?.chunk_ids.length) {
            await this.index.delete({ ids: previousEntry.chunk_ids });
            deletedChunks += previousEntry.chunk_ids.length;
          }
          const records = await this.buildVectorRecords(file);
          if (records.length > 0) {
            await this.index.upsert(records);
          }
          nextFiles[file.relativePath] = {
            content_hash: file.contentHash,
            chunk_ids: records.map((record) => record.id),
            chunk_count: records.length,
            size_bytes: file.sizeBytes
          };
          indexedChunks += records.length;
          if (previousEntry) {
            updatedFiles += 1;
          } else {
            addedFiles += 1;
          }
        }
        const state = (0, indexState_1.createHydrationIndexState)({
          collectionName: this.index.collectionName,
          vectorBackend: params.vectorBackend,
          embedderModel: this.embedder.modelId,
          chunkerVersion: this.chunker.version,
          strategyId: this.strategyId,
          repoRoot: this.repoRoot,
          cacheKey: params.cacheKey,
          prScopeHash: params.prScopeHash,
          normativeCommit: params.normativeCommit,
          indexedFiles: nextFiles
        });
        (0, indexState_1.saveHydrationIndexState)(artifactPaths.indexStatePath, state);
        (0, persistence_1.writeHydrationPersistManifest)({
          persistRoot: artifactPaths.persistRoot,
          writerKind: params.vectorBackend,
          cacheKey: params.cacheKey
        });
        return {
          addedFiles,
          updatedFiles,
          removedFiles: Object.keys(previousFiles).filter((entry) => !currentPaths.has(entry)).length,
          unchangedFiles,
          indexedChunks,
          deletedChunks,
          state
        };
      }
      async buildVectorRecords(file) {
        const chunks = this.chunker.chunkText(file.relativePath, file.content);
        if (chunks.length === 0) {
          return [];
        }
        const embeddings = await this.embedder.embedDocuments(chunks.map((chunk) => chunk.document));
        return chunks.map((chunk, index) => this.toVectorRecord(chunk, file.contentHash, file.sizeBytes, embeddings[index] ?? []));
      }
      toVectorRecord(chunk, contentHash, sizeBytes, embedding) {
        return {
          id: chunk.id,
          document: chunk.document,
          embedding,
          metadata: {
            path: chunk.path,
            start_line: chunk.startLine,
            end_line: chunk.endLine,
            content_hash: contentHash,
            chunk_id: chunk.id,
            size_bytes: sizeBytes
          }
        };
      }
    };
    exports2.HydrationIndexer = HydrationIndexer;
  }
});

// ../../packages/tonic-core/dist/hydration/memoryVectorIndex.js
var require_memoryVectorIndex = __commonJS({
  "../../packages/tonic-core/dist/hydration/memoryVectorIndex.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.MemoryVectorIndex = void 0;
    function cosineSimilarity(a, b) {
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const len = Math.max(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
      }
      if (normA === 0 || normB === 0) {
        return 0;
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    function matchesFilter(metadata, filter) {
      if (!filter) {
        return true;
      }
      const md = metadata ?? {};
      return Object.entries(filter).every(([key, value]) => md[key] === value);
    }
    var MemoryVectorIndex = class {
      backend = "memory";
      collectionName;
      records = /* @__PURE__ */ new Map();
      constructor(collectionName) {
        this.collectionName = collectionName;
      }
      async upsert(records) {
        for (const record of records) {
          this.records.set(record.id, record);
        }
      }
      async similaritySearch(queryEmbedding, limit, filter) {
        return [...this.records.values()].filter((record) => matchesFilter(record.metadata, filter)).map((record) => ({
          id: record.id,
          document: record.document,
          metadata: record.metadata,
          embedding: record.embedding,
          score: cosineSimilarity(queryEmbedding, record.embedding)
        })).sort((a, b) => b.score - a.score).slice(0, Math.max(0, limit));
      }
      async getByIds(ids) {
        return ids.map((id) => this.records.get(id)).filter((record) => Boolean(record)).map((record) => ({
          id: record.id,
          document: record.document,
          metadata: record.metadata,
          embedding: record.embedding,
          score: 1
        }));
      }
      async delete(params) {
        if (params.ids?.length) {
          for (const id of params.ids) {
            this.records.delete(id);
          }
          return;
        }
        if (params.filter) {
          for (const [id, record] of this.records.entries()) {
            if (matchesFilter(record.metadata, params.filter)) {
              this.records.delete(id);
            }
          }
        }
      }
    };
    exports2.MemoryVectorIndex = MemoryVectorIndex;
  }
});

// ../../packages/tonic-core/dist/hydration/pipelineGraph.js
var require_pipelineGraph = __commonJS({
  "../../packages/tonic-core/dist/hydration/pipelineGraph.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HYDRATION_PIPELINE_STAGE_IDS = void 0;
    exports2.createDefaultHydrationPipelineStages = createDefaultHydrationPipelineStages;
    exports2.HYDRATION_PIPELINE_STAGE_IDS = [
      "config.resolve",
      "branch_intents.collect",
      "index.sync",
      "question_plan.compose",
      "hydrate.cycle",
      "code_walk.run",
      "retrieval.merge",
      "llm.transcript",
      "metadata.hydrate",
      "emit"
    ];
    function createDefaultHydrationPipelineStages() {
      return exports2.HYDRATION_PIPELINE_STAGE_IDS.map((stageId) => ({
        stage_id: stageId,
        status: "pending"
      }));
    }
  }
});

// ../../packages/tonic-core/dist/hydration/runtimeConfig.js
var require_runtimeConfig = __commonJS({
  "../../packages/tonic-core/dist/hydration/runtimeConfig.js"(exports2) {
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
    exports2.defaultHydrationCollectionName = defaultHydrationCollectionName;
    exports2.resolveHydrationRuntimeConfig = resolveHydrationRuntimeConfig;
    exports2.runtimeModeToBackend = runtimeModeToBackend;
    var path = __importStar(require("node:path"));
    var paths_1 = require_paths();
    function normalizeMode(raw) {
      const value = (raw ?? "http").trim().toLowerCase();
      if (value === "persistent" || value === "ephemeral" || value === "memory") {
        return value;
      }
      return "http";
    }
    function defaultHydrationCollectionName(repoRoot) {
      const base = path.basename(path.resolve(repoRoot)).toLowerCase();
      const safe = base.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
      return `${safe || "repo"}-hydration`;
    }
    function resolveHydrationRuntimeConfig(repoRoot, env3 = process.env) {
      const artifactPaths = (0, paths_1.resolveHydrationArtifactPaths)(repoRoot);
      return {
        mode: normalizeMode(env3.TONIC_CHROMA_MODE),
        collectionName: (env3.TONIC_CHROMA_COLLECTION ?? "").trim() || defaultHydrationCollectionName(repoRoot),
        persistPath: path.resolve((env3.TONIC_CHROMA_PERSIST_PATH ?? "").trim() || artifactPaths.persistRoot),
        url: (env3.TONIC_CHROMA_URL ?? "http://127.0.0.1:8000").trim(),
        heartbeatPath: (env3.TONIC_CHROMA_HEARTBEAT_PATH ?? "/api/v2/heartbeat").trim()
      };
    }
    function runtimeModeToBackend(mode) {
      if (mode === "memory") {
        return "memory";
      }
      if (mode === "persistent") {
        return "chroma-persistent";
      }
      if (mode === "ephemeral") {
        return "ephemeral";
      }
      return "chroma-http";
    }
  }
});

// ../../packages/tonic-core/dist/hydration/optionalAi.js
var require_optionalAi = __commonJS({
  "../../packages/tonic-core/dist/hydration/optionalAi.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HYDRATION_CHROMADB_SERVER_IMAGE = exports2.HYDRATION_CHROMADB_VERSION = exports2.HYDRATION_CHROMADB_NPM_PACKAGE = exports2.HYDRATION_OPTIONAL_DEPENDENCY_GROUP = void 0;
    exports2.probeHydrationOptionalAiDependency = probeHydrationOptionalAiDependency;
    exports2.buildMissingOptionalAiDependencySkipResult = buildMissingOptionalAiDependencySkipResult;
    var paths_1 = require_paths();
    var runtimeConfig_1 = require_runtimeConfig();
    var types_1 = require_types();
    exports2.HYDRATION_OPTIONAL_DEPENDENCY_GROUP = "ai";
    exports2.HYDRATION_CHROMADB_NPM_PACKAGE = "chromadb";
    exports2.HYDRATION_CHROMADB_VERSION = "0.5.23";
    exports2.HYDRATION_CHROMADB_SERVER_IMAGE = `chromadb/chroma:${exports2.HYDRATION_CHROMADB_VERSION}`;
    function tryRequire(moduleName) {
      try {
        const req = Function("return require")();
        req(moduleName);
        return true;
      } catch {
        return false;
      }
    }
    function probeHydrationOptionalAiDependency() {
      const packageName = exports2.HYDRATION_CHROMADB_NPM_PACKAGE;
      const available = tryRequire(packageName);
      return {
        available,
        packageName,
        installHint: available ? "" : `Install optional npm dependency '${packageName}@${exports2.HYDRATION_CHROMADB_VERSION}' before using non-memory hydration backends.`
      };
    }
    function buildMissingOptionalAiDependencySkipResult(repoRoot, rationale) {
      const artifacts = (0, paths_1.resolveHydrationArtifactPaths)(repoRoot);
      const runtime = (0, runtimeConfig_1.resolveHydrationRuntimeConfig)(repoRoot);
      return {
        schema: types_1.HYDRATION_INTENT_RESULT_SCHEMA,
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        run_id: "hydrate-intents-skip",
        repo_root: repoRoot,
        persist_root: artifacts.persistRoot,
        run_root: artifacts.runRoot,
        vector_backend: (0, runtimeConfig_1.runtimeModeToBackend)(runtime.mode),
        hydration_skipped: true,
        skip_reason: "missing_optional_ai_dependencies",
        tags_added: [],
        rationale: rationale ?? "",
        metadata: {
          optional_dependency_group: exports2.HYDRATION_OPTIONAL_DEPENDENCY_GROUP,
          missing_package: exports2.HYDRATION_CHROMADB_NPM_PACKAGE,
          expected_package_version: exports2.HYDRATION_CHROMADB_VERSION,
          expected_server_image: exports2.HYDRATION_CHROMADB_SERVER_IMAGE,
          skip_exit_code: types_1.HYDRATION_OPTIONAL_AI_EXIT_CODE
        }
      };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/runState.js
var require_runState = __commonJS({
  "../../packages/tonic-core/dist/hydration/runState.js"(exports2) {
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
    exports2.defaultHydrationRunId = defaultHydrationRunId;
    exports2.resolveHydrationRunDirectory = resolveHydrationRunDirectory;
    exports2.createHydrationPipelineRun = createHydrationPipelineRun;
    exports2.saveHydrationPipelineRun = saveHydrationPipelineRun;
    exports2.loadHydrationPipelineRun = loadHydrationPipelineRun;
    exports2.updateHydrationPipelineStage = updateHydrationPipelineStage;
    exports2.finalizeHydrationPipelineRun = finalizeHydrationPipelineRun;
    exports2.createHydrationBranchIntentCollection = createHydrationBranchIntentCollection;
    exports2.createHydrationQuestionPlan = createHydrationQuestionPlan;
    exports2.createHydrationCycleState = createHydrationCycleState;
    exports2.buildHydrationRetrievalMerge = buildHydrationRetrievalMerge;
    exports2.writeHydrationArtifact = writeHydrationArtifact;
    exports2.markStageArtifactWritten = markStageArtifactWritten;
    var node_crypto_1 = require("node:crypto");
    var fs = __importStar(require("node:fs"));
    var path = __importStar(require("node:path"));
    var paths_1 = require_paths();
    var types_1 = require_types();
    var pipelineGraph_1 = require_pipelineGraph();
    var ARTIFACT_FILE_NAMES = {
      branch_intents: "branch-intents.json",
      question_plan: "question-plan.json",
      hydration_cycle: "hydration-cycle.json",
      retrieval: "retrieval.json",
      retrieval_merge: "retrieval-merge.json",
      hydration_result: "hydration-result.json"
    };
    function nowIso() {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
    function contentHashFor(value) {
      return (0, node_crypto_1.createHash)("sha256").update(JSON.stringify(value), "utf8").digest("hex");
    }
    function defaultHydrationRunId() {
      return (0, node_crypto_1.randomUUID)();
    }
    function resolveHydrationRunDirectory(repoRoot, runId) {
      return path.join((0, paths_1.resolveHydrationArtifactPaths)(repoRoot).runRoot, runId);
    }
    function createHydrationPipelineRun(params) {
      const artifactPaths = (0, paths_1.resolveHydrationArtifactPaths)(params.repoRoot);
      const runId = params.runId ?? defaultHydrationRunId();
      const runDir = resolveHydrationRunDirectory(params.repoRoot, runId);
      return {
        schema: types_1.HYDRATION_PIPELINE_SCHEMA,
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        run_id: runId,
        repo_root: params.repoRoot,
        persist_root: artifactPaths.persistRoot,
        vector_backend: params.vectorBackend,
        run_status: "planned",
        stages: (0, pipelineGraph_1.createDefaultHydrationPipelineStages)(),
        artifacts: {
          index_state_path: artifactPaths.indexStatePath,
          run_state_path: path.join(runDir, "run-state.json")
        }
      };
    }
    function saveHydrationPipelineRun(run) {
      fs.mkdirSync(path.dirname(run.artifacts.run_state_path), { recursive: true });
      fs.writeFileSync(run.artifacts.run_state_path, JSON.stringify(run, null, 2) + "\n", "utf8");
    }
    function loadHydrationPipelineRun(filePath) {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
    function updateHydrationPipelineStage(run, stageId, params) {
      run.stages = run.stages.map((stage) => {
        if (stage.stage_id !== stageId) {
          return stage;
        }
        const started = stage.started_at || (params.status === "running" ? nowIso() : void 0);
        const finished = params.status !== "running" ? nowIso() : void 0;
        return {
          ...stage,
          status: params.status,
          content_hash: params.contentHash ?? stage.content_hash,
          error: params.error ?? stage.error,
          started_at: started ?? stage.started_at,
          finished_at: finished ?? stage.finished_at
        };
      });
      if (params.status === "running") {
        run.run_status = "running";
      } else if (params.status === "failed") {
        run.run_status = "failed";
      }
      return run;
    }
    function finalizeHydrationPipelineRun(run, status) {
      run.run_status = status;
      return run;
    }
    function createHydrationBranchIntentCollection(branchIntents) {
      return {
        schema: "tonic-branch-intents",
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        branch_intents: branchIntents
      };
    }
    function createHydrationQuestionPlan(params) {
      return {
        schema: "tonic-hydration-question-plan",
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        downstream_task: params.downstreamTask,
        max_questions: params.maxQuestions,
        branch_intent_count: params.branchIntentCount,
        question_slots: params.questionSlots
      };
    }
    function createHydrationCycleState(cycleNumber, nodes) {
      return {
        schema: "tonic-hydration-cycle",
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        cycle_number: cycleNumber,
        nodes
      };
    }
    function buildHydrationRetrievalMerge(retrievalBundles) {
      const evidenceByPath = /* @__PURE__ */ new Map();
      for (const bundle of retrievalBundles) {
        for (const hit of bundle.vector_hits) {
          const entry = evidenceByPath.get(hit.path) ?? {
            slot_ids: /* @__PURE__ */ new Set(),
            chunk_ids: /* @__PURE__ */ new Set(),
            ast_node_ids: /* @__PURE__ */ new Set()
          };
          entry.slot_ids.add(bundle.slot_id);
          entry.chunk_ids.add(hit.chunk_id);
          evidenceByPath.set(hit.path, entry);
        }
        for (const candidate of bundle.ast_candidates) {
          const entry = evidenceByPath.get(candidate.path) ?? {
            slot_ids: /* @__PURE__ */ new Set(),
            chunk_ids: /* @__PURE__ */ new Set(),
            ast_node_ids: /* @__PURE__ */ new Set()
          };
          entry.slot_ids.add(bundle.slot_id);
          entry.ast_node_ids.add(candidate.ast_node_id);
          evidenceByPath.set(candidate.path, entry);
        }
      }
      return {
        schema: "tonic-hydration-retrieval-merge",
        pipeline_version: types_1.HYDRATION_PIPELINE_VERSION,
        retrieval_bundles: retrievalBundles,
        evidence_by_path: [...evidenceByPath.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([filePath, entry]) => ({
          path: filePath,
          slot_ids: [...entry.slot_ids].sort(),
          chunk_ids: [...entry.chunk_ids].sort(),
          ast_node_ids: [...entry.ast_node_ids].sort()
        }))
      };
    }
    function writeHydrationArtifact(run, key, value) {
      const runDir = path.dirname(run.artifacts.run_state_path);
      fs.mkdirSync(runDir, { recursive: true });
      const targetPath = path.join(runDir, ARTIFACT_FILE_NAMES[key]);
      fs.writeFileSync(targetPath, JSON.stringify(value, null, 2) + "\n", "utf8");
      run.artifacts[`${key}_path`] = targetPath;
      return targetPath;
    }
    function markStageArtifactWritten(run, stageId, value) {
      return updateHydrationPipelineStage(run, stageId, {
        status: "completed",
        contentHash: contentHashFor(value)
      });
    }
  }
});

// ../../packages/tonic-core/dist/hydration/chromaVectorIndex.js
var require_chromaVectorIndex = __commonJS({
  "../../packages/tonic-core/dist/hydration/chromaVectorIndex.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ChromaVectorIndex = void 0;
    var chromaClient_1 = require_chromaClient();
    function toScore(distance) {
      if (distance == null) {
        return 0;
      }
      return 1 / (1 + distance);
    }
    var ChromaVectorIndex = class {
      backend;
      collectionName;
      config;
      collectionPromise = null;
      constructor(config) {
        this.config = config;
        this.collectionName = config.collectionName;
        this.backend = "chroma-http";
      }
      async collection() {
        if (!this.collectionPromise) {
          this.collectionPromise = (0, chromaClient_1.getHydrationChromaCollection)(this.config);
        }
        return this.collectionPromise;
      }
      async upsert(records) {
        if (records.length === 0) {
          return;
        }
        const collection = await this.collection();
        await collection.upsert({
          ids: records.map((record) => record.id),
          documents: records.map((record) => record.document),
          embeddings: records.map((record) => record.embedding),
          metadatas: records.map((record) => record.metadata ?? {})
        });
      }
      async similaritySearch(queryEmbedding, limit, filter) {
        const collection = await this.collection();
        const result = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: limit,
          where: filter,
          include: ["documents", "metadatas", "distances", "embeddings"]
        });
        const ids = result.ids?.[0] ?? [];
        const documents = result.documents?.[0] ?? [];
        const metadatas = result.metadatas?.[0] ?? [];
        const distances = result.distances?.[0] ?? [];
        const embeddings = result.embeddings?.[0] ?? [];
        return ids.map((id, index) => ({
          id,
          document: documents[index] ?? "",
          metadata: metadatas[index] ?? {},
          embedding: embeddings[index],
          score: toScore(distances[index])
        }));
      }
      async getByIds(ids) {
        if (ids.length === 0) {
          return [];
        }
        const collection = await this.collection();
        const result = await collection.get({
          ids,
          include: ["documents", "metadatas", "embeddings"]
        });
        return (result.ids ?? []).map((id, index) => ({
          id,
          document: result.documents?.[index] ?? "",
          metadata: result.metadatas?.[index] ?? {},
          embedding: result.embeddings?.[index],
          score: 1
        }));
      }
      async delete(params) {
        const collection = await this.collection();
        await collection.delete({
          ids: params.ids,
          where: params.filter
        });
      }
    };
    exports2.ChromaVectorIndex = ChromaVectorIndex;
  }
});

// ../../packages/tonic-core/dist/hydration/runtime.js
var require_runtime = __commonJS({
  "../../packages/tonic-core/dist/hydration/runtime.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.probeHydrationRuntimeReadiness = probeHydrationRuntimeReadiness;
    exports2.createHydrationRuntime = createHydrationRuntime;
    var chromaVectorIndex_1 = require_chromaVectorIndex();
    var chromaClient_1 = require_chromaClient();
    var errors_1 = require_errors();
    var memoryVectorIndex_1 = require_memoryVectorIndex();
    var runtimeConfig_1 = require_runtimeConfig();
    async function probeHydrationRuntimeReadiness(repoRoot, env3 = process.env) {
      const config = (0, runtimeConfig_1.resolveHydrationRuntimeConfig)(repoRoot, env3);
      if (config.mode !== "http") {
        return null;
      }
      return (0, chromaClient_1.probeHydrationChromaHeartbeat)(config);
    }
    async function createHydrationRuntime(repoRoot, env3 = process.env) {
      const config = (0, runtimeConfig_1.resolveHydrationRuntimeConfig)(repoRoot, env3);
      const backend = (0, runtimeConfig_1.runtimeModeToBackend)(config.mode);
      if (config.mode === "memory") {
        return {
          backend,
          config,
          index: new memoryVectorIndex_1.MemoryVectorIndex(config.collectionName)
        };
      }
      if (config.mode !== "http") {
        throw new errors_1.HydrationRuntimeError(`TypeScript hydration currently supports Chroma only through HTTP mode. Received TONIC_CHROMA_MODE=${config.mode}.`);
      }
      return {
        backend,
        config,
        index: new chromaVectorIndex_1.ChromaVectorIndex(config)
      };
    }
  }
});

// ../../packages/tonic-core/dist/hydration/index.js
var require_hydration = __commonJS({
  "../../packages/tonic-core/dist/hydration/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.HYDRATION_PERSIST_MANIFEST_SCHEMA = exports2.HYDRATION_PERSIST_MANIFEST_FILE_NAME = exports2.HYDRATION_PERSIST_LOCK_FILE_NAME = exports2.HYDRATION_CACHE_KEY_SCHEMA_VERSION = exports2.checkHydrationPersistHealth = exports2.buildHydrationCacheKey = exports2.assertHydrationPersistHealth = exports2.acquireHydrationPersistLock = exports2.HydrationRepository = exports2.resolveHydrationArtifactPaths = exports2.DEFAULT_TONIC_DIR_NAME = exports2.DEFAULT_INDEX_STATE_FILE_NAME = exports2.DEFAULT_HYDRATION_RUNS_DIR_NAME = exports2.DEFAULT_CHROMA_DIR_NAME = exports2.probeHydrationOptionalAiDependency = exports2.buildMissingOptionalAiDependencySkipResult = exports2.HYDRATION_OPTIONAL_DEPENDENCY_GROUP = exports2.HYDRATION_CHROMADB_VERSION = exports2.HYDRATION_CHROMADB_SERVER_IMAGE = exports2.HYDRATION_CHROMADB_NPM_PACKAGE = exports2.HYDRATION_PIPELINE_STAGE_IDS = exports2.createDefaultHydrationPipelineStages = exports2.MemoryVectorIndex = exports2.HydrationIndexer = exports2.appendHydrationLlmTranscriptEvent = exports2.saveHydrationIndexState = exports2.loadHydrationIndexState = exports2.isHydrationIndexStateCompatible = exports2.HYDRATION_INDEX_STATE_SCHEMA = exports2.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION = exports2.createHydrationIndexState = exports2.HydrationRuntimeError = exports2.HydrationPersistError = exports2.OptionalAiDependencyError = exports2.DeterministicFakeEmbedder = exports2.LineTokenEstimateChunker = exports2.loadHydrationPrompts = exports2.loadConflictPrompts = exports2.formatHydrationPromptTemplate = exports2.buildHydrationSynthesisPrompt = exports2.buildGuidedQuestionGenerationPrompt = exports2.probeHydrationChromaHeartbeat = exports2.parseHydrationChromaUrl = exports2.loadHydrationChromaModule = exports2.getHydrationChromaCollection = exports2.createHydrationChromaClient = exports2.HYDRATION_OPTIONAL_AI_EXIT_CODE = exports2.HYDRATION_PIPELINE_VERSION = exports2.HYDRATION_PIPELINE_SCHEMA = exports2.HYDRATION_INTENT_RESULT_SCHEMA = void 0;
    exports2.runtimeModeToBackend = exports2.resolveHydrationRuntimeConfig = exports2.defaultHydrationCollectionName = exports2.probeHydrationRuntimeReadiness = exports2.createHydrationRuntime = exports2.writeHydrationArtifact = exports2.updateHydrationPipelineStage = exports2.saveHydrationPipelineRun = exports2.resolveHydrationRunDirectory = exports2.markStageArtifactWritten = exports2.loadHydrationPipelineRun = exports2.finalizeHydrationPipelineRun = exports2.defaultHydrationRunId = exports2.createHydrationQuestionPlan = exports2.createHydrationPipelineRun = exports2.createHydrationCycleState = exports2.createHydrationBranchIntentCollection = exports2.buildHydrationRetrievalMerge = exports2.writeHydrationPersistManifest = exports2.resolveHydrationPersistManifestPath = exports2.loadHydrationPersistManifest = void 0;
    var types_1 = require_types();
    Object.defineProperty(exports2, "HYDRATION_INTENT_RESULT_SCHEMA", { enumerable: true, get: function() {
      return types_1.HYDRATION_INTENT_RESULT_SCHEMA;
    } });
    Object.defineProperty(exports2, "HYDRATION_PIPELINE_SCHEMA", { enumerable: true, get: function() {
      return types_1.HYDRATION_PIPELINE_SCHEMA;
    } });
    Object.defineProperty(exports2, "HYDRATION_PIPELINE_VERSION", { enumerable: true, get: function() {
      return types_1.HYDRATION_PIPELINE_VERSION;
    } });
    Object.defineProperty(exports2, "HYDRATION_OPTIONAL_AI_EXIT_CODE", { enumerable: true, get: function() {
      return types_1.HYDRATION_OPTIONAL_AI_EXIT_CODE;
    } });
    var chromaClient_1 = require_chromaClient();
    Object.defineProperty(exports2, "createHydrationChromaClient", { enumerable: true, get: function() {
      return chromaClient_1.createHydrationChromaClient;
    } });
    Object.defineProperty(exports2, "getHydrationChromaCollection", { enumerable: true, get: function() {
      return chromaClient_1.getHydrationChromaCollection;
    } });
    Object.defineProperty(exports2, "loadHydrationChromaModule", { enumerable: true, get: function() {
      return chromaClient_1.loadHydrationChromaModule;
    } });
    Object.defineProperty(exports2, "parseHydrationChromaUrl", { enumerable: true, get: function() {
      return chromaClient_1.parseHydrationChromaUrl;
    } });
    Object.defineProperty(exports2, "probeHydrationChromaHeartbeat", { enumerable: true, get: function() {
      return chromaClient_1.probeHydrationChromaHeartbeat;
    } });
    var promptBundle_1 = require_promptBundle();
    Object.defineProperty(exports2, "buildGuidedQuestionGenerationPrompt", { enumerable: true, get: function() {
      return promptBundle_1.buildGuidedQuestionGenerationPrompt;
    } });
    Object.defineProperty(exports2, "buildHydrationSynthesisPrompt", { enumerable: true, get: function() {
      return promptBundle_1.buildHydrationSynthesisPrompt;
    } });
    Object.defineProperty(exports2, "formatHydrationPromptTemplate", { enumerable: true, get: function() {
      return promptBundle_1.formatHydrationPromptTemplate;
    } });
    Object.defineProperty(exports2, "loadConflictPrompts", { enumerable: true, get: function() {
      return promptBundle_1.loadConflictPrompts;
    } });
    Object.defineProperty(exports2, "loadHydrationPrompts", { enumerable: true, get: function() {
      return promptBundle_1.loadHydrationPrompts;
    } });
    var chunker_1 = require_chunker();
    Object.defineProperty(exports2, "LineTokenEstimateChunker", { enumerable: true, get: function() {
      return chunker_1.LineTokenEstimateChunker;
    } });
    var embedder_1 = require_embedder();
    Object.defineProperty(exports2, "DeterministicFakeEmbedder", { enumerable: true, get: function() {
      return embedder_1.DeterministicFakeEmbedder;
    } });
    var errors_1 = require_errors();
    Object.defineProperty(exports2, "OptionalAiDependencyError", { enumerable: true, get: function() {
      return errors_1.OptionalAiDependencyError;
    } });
    Object.defineProperty(exports2, "HydrationPersistError", { enumerable: true, get: function() {
      return errors_1.HydrationPersistError;
    } });
    Object.defineProperty(exports2, "HydrationRuntimeError", { enumerable: true, get: function() {
      return errors_1.HydrationRuntimeError;
    } });
    var indexState_1 = require_indexState();
    Object.defineProperty(exports2, "createHydrationIndexState", { enumerable: true, get: function() {
      return indexState_1.createHydrationIndexState;
    } });
    Object.defineProperty(exports2, "HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION", { enumerable: true, get: function() {
      return indexState_1.HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION;
    } });
    Object.defineProperty(exports2, "HYDRATION_INDEX_STATE_SCHEMA", { enumerable: true, get: function() {
      return indexState_1.HYDRATION_INDEX_STATE_SCHEMA;
    } });
    Object.defineProperty(exports2, "isHydrationIndexStateCompatible", { enumerable: true, get: function() {
      return indexState_1.isHydrationIndexStateCompatible;
    } });
    Object.defineProperty(exports2, "loadHydrationIndexState", { enumerable: true, get: function() {
      return indexState_1.loadHydrationIndexState;
    } });
    Object.defineProperty(exports2, "saveHydrationIndexState", { enumerable: true, get: function() {
      return indexState_1.saveHydrationIndexState;
    } });
    var llmTranscript_1 = require_llmTranscript();
    Object.defineProperty(exports2, "appendHydrationLlmTranscriptEvent", { enumerable: true, get: function() {
      return llmTranscript_1.appendHydrationLlmTranscriptEvent;
    } });
    var indexer_1 = require_indexer();
    Object.defineProperty(exports2, "HydrationIndexer", { enumerable: true, get: function() {
      return indexer_1.HydrationIndexer;
    } });
    var memoryVectorIndex_1 = require_memoryVectorIndex();
    Object.defineProperty(exports2, "MemoryVectorIndex", { enumerable: true, get: function() {
      return memoryVectorIndex_1.MemoryVectorIndex;
    } });
    var pipelineGraph_1 = require_pipelineGraph();
    Object.defineProperty(exports2, "createDefaultHydrationPipelineStages", { enumerable: true, get: function() {
      return pipelineGraph_1.createDefaultHydrationPipelineStages;
    } });
    Object.defineProperty(exports2, "HYDRATION_PIPELINE_STAGE_IDS", { enumerable: true, get: function() {
      return pipelineGraph_1.HYDRATION_PIPELINE_STAGE_IDS;
    } });
    var optionalAi_1 = require_optionalAi();
    Object.defineProperty(exports2, "HYDRATION_CHROMADB_NPM_PACKAGE", { enumerable: true, get: function() {
      return optionalAi_1.HYDRATION_CHROMADB_NPM_PACKAGE;
    } });
    Object.defineProperty(exports2, "HYDRATION_CHROMADB_SERVER_IMAGE", { enumerable: true, get: function() {
      return optionalAi_1.HYDRATION_CHROMADB_SERVER_IMAGE;
    } });
    Object.defineProperty(exports2, "HYDRATION_CHROMADB_VERSION", { enumerable: true, get: function() {
      return optionalAi_1.HYDRATION_CHROMADB_VERSION;
    } });
    Object.defineProperty(exports2, "HYDRATION_OPTIONAL_DEPENDENCY_GROUP", { enumerable: true, get: function() {
      return optionalAi_1.HYDRATION_OPTIONAL_DEPENDENCY_GROUP;
    } });
    Object.defineProperty(exports2, "buildMissingOptionalAiDependencySkipResult", { enumerable: true, get: function() {
      return optionalAi_1.buildMissingOptionalAiDependencySkipResult;
    } });
    Object.defineProperty(exports2, "probeHydrationOptionalAiDependency", { enumerable: true, get: function() {
      return optionalAi_1.probeHydrationOptionalAiDependency;
    } });
    var paths_1 = require_paths();
    Object.defineProperty(exports2, "DEFAULT_CHROMA_DIR_NAME", { enumerable: true, get: function() {
      return paths_1.DEFAULT_CHROMA_DIR_NAME;
    } });
    Object.defineProperty(exports2, "DEFAULT_HYDRATION_RUNS_DIR_NAME", { enumerable: true, get: function() {
      return paths_1.DEFAULT_HYDRATION_RUNS_DIR_NAME;
    } });
    Object.defineProperty(exports2, "DEFAULT_INDEX_STATE_FILE_NAME", { enumerable: true, get: function() {
      return paths_1.DEFAULT_INDEX_STATE_FILE_NAME;
    } });
    Object.defineProperty(exports2, "DEFAULT_TONIC_DIR_NAME", { enumerable: true, get: function() {
      return paths_1.DEFAULT_TONIC_DIR_NAME;
    } });
    Object.defineProperty(exports2, "resolveHydrationArtifactPaths", { enumerable: true, get: function() {
      return paths_1.resolveHydrationArtifactPaths;
    } });
    var repository_1 = require_repository();
    Object.defineProperty(exports2, "HydrationRepository", { enumerable: true, get: function() {
      return repository_1.HydrationRepository;
    } });
    var persistence_1 = require_persistence();
    Object.defineProperty(exports2, "acquireHydrationPersistLock", { enumerable: true, get: function() {
      return persistence_1.acquireHydrationPersistLock;
    } });
    Object.defineProperty(exports2, "assertHydrationPersistHealth", { enumerable: true, get: function() {
      return persistence_1.assertHydrationPersistHealth;
    } });
    Object.defineProperty(exports2, "buildHydrationCacheKey", { enumerable: true, get: function() {
      return persistence_1.buildHydrationCacheKey;
    } });
    Object.defineProperty(exports2, "checkHydrationPersistHealth", { enumerable: true, get: function() {
      return persistence_1.checkHydrationPersistHealth;
    } });
    Object.defineProperty(exports2, "HYDRATION_CACHE_KEY_SCHEMA_VERSION", { enumerable: true, get: function() {
      return persistence_1.HYDRATION_CACHE_KEY_SCHEMA_VERSION;
    } });
    Object.defineProperty(exports2, "HYDRATION_PERSIST_LOCK_FILE_NAME", { enumerable: true, get: function() {
      return persistence_1.HYDRATION_PERSIST_LOCK_FILE_NAME;
    } });
    Object.defineProperty(exports2, "HYDRATION_PERSIST_MANIFEST_FILE_NAME", { enumerable: true, get: function() {
      return persistence_1.HYDRATION_PERSIST_MANIFEST_FILE_NAME;
    } });
    Object.defineProperty(exports2, "HYDRATION_PERSIST_MANIFEST_SCHEMA", { enumerable: true, get: function() {
      return persistence_1.HYDRATION_PERSIST_MANIFEST_SCHEMA;
    } });
    Object.defineProperty(exports2, "loadHydrationPersistManifest", { enumerable: true, get: function() {
      return persistence_1.loadHydrationPersistManifest;
    } });
    Object.defineProperty(exports2, "resolveHydrationPersistManifestPath", { enumerable: true, get: function() {
      return persistence_1.resolveHydrationPersistManifestPath;
    } });
    Object.defineProperty(exports2, "writeHydrationPersistManifest", { enumerable: true, get: function() {
      return persistence_1.writeHydrationPersistManifest;
    } });
    var runState_1 = require_runState();
    Object.defineProperty(exports2, "buildHydrationRetrievalMerge", { enumerable: true, get: function() {
      return runState_1.buildHydrationRetrievalMerge;
    } });
    Object.defineProperty(exports2, "createHydrationBranchIntentCollection", { enumerable: true, get: function() {
      return runState_1.createHydrationBranchIntentCollection;
    } });
    Object.defineProperty(exports2, "createHydrationCycleState", { enumerable: true, get: function() {
      return runState_1.createHydrationCycleState;
    } });
    Object.defineProperty(exports2, "createHydrationPipelineRun", { enumerable: true, get: function() {
      return runState_1.createHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "createHydrationQuestionPlan", { enumerable: true, get: function() {
      return runState_1.createHydrationQuestionPlan;
    } });
    Object.defineProperty(exports2, "defaultHydrationRunId", { enumerable: true, get: function() {
      return runState_1.defaultHydrationRunId;
    } });
    Object.defineProperty(exports2, "finalizeHydrationPipelineRun", { enumerable: true, get: function() {
      return runState_1.finalizeHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "loadHydrationPipelineRun", { enumerable: true, get: function() {
      return runState_1.loadHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "markStageArtifactWritten", { enumerable: true, get: function() {
      return runState_1.markStageArtifactWritten;
    } });
    Object.defineProperty(exports2, "resolveHydrationRunDirectory", { enumerable: true, get: function() {
      return runState_1.resolveHydrationRunDirectory;
    } });
    Object.defineProperty(exports2, "saveHydrationPipelineRun", { enumerable: true, get: function() {
      return runState_1.saveHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "updateHydrationPipelineStage", { enumerable: true, get: function() {
      return runState_1.updateHydrationPipelineStage;
    } });
    Object.defineProperty(exports2, "writeHydrationArtifact", { enumerable: true, get: function() {
      return runState_1.writeHydrationArtifact;
    } });
    var runtime_1 = require_runtime();
    Object.defineProperty(exports2, "createHydrationRuntime", { enumerable: true, get: function() {
      return runtime_1.createHydrationRuntime;
    } });
    Object.defineProperty(exports2, "probeHydrationRuntimeReadiness", { enumerable: true, get: function() {
      return runtime_1.probeHydrationRuntimeReadiness;
    } });
    var runtimeConfig_1 = require_runtimeConfig();
    Object.defineProperty(exports2, "defaultHydrationCollectionName", { enumerable: true, get: function() {
      return runtimeConfig_1.defaultHydrationCollectionName;
    } });
    Object.defineProperty(exports2, "resolveHydrationRuntimeConfig", { enumerable: true, get: function() {
      return runtimeConfig_1.resolveHydrationRuntimeConfig;
    } });
    Object.defineProperty(exports2, "runtimeModeToBackend", { enumerable: true, get: function() {
      return runtimeConfig_1.runtimeModeToBackend;
    } });
  }
});

// ../../packages/tonic-core/dist/index.js
var require_dist = __commonJS({
  "../../packages/tonic-core/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.applyTonicHeuristic = exports2.applyTonicResolutions = exports2.suggestionLineCountOk = exports2.heuristicResolvedLines = exports2.conflictFileFromBlocks = exports2.conflictRegionsToAnnotatedLines = exports2.annotatedToConflictFile = exports2.mergeSnapshots = exports2.DEFAULT_INTENT_PROFILE_PATH = exports2.promptIntentPairInteractive = exports2.parseIntentPair = exports2.saveIntentProfile = exports2.loadIntentProfile = exports2.createDefaultGitAuthorProbe = exports2.parseGitAuthorNameEmail = exports2.humanAliasFromGitStdout = exports2.resolveAuthorAliasForSide = exports2.DEFAULT_GIT_MERGE_RIGHT_INTENT = exports2.DEFAULT_GIT_MERGE_LEFT_INTENT = exports2.gitConflictBlocksToTonicAnnotatedPreview = exports2.gitConflictBlocksToConflictRegions = exports2.hasGitConflictMarkers = exports2.parseGitConflictsWithDiagnostics = exports2.parseGitConflicts = exports2.sanitizeAuthorTagToken = exports2.normalizeConflictLabel = exports2.updateTagInConflictLabel = exports2.removeTagFromConflictLabel = exports2.addTagToConflictLabel = exports2.formatConflictLabel = exports2.parseConflictLabel = exports2.conflictSummary = exports2.parseTonicConflictsWithDiagnostics = exports2.parseTonicConflicts = exports2.deserializeState = exports2.serializeState = exports2.conflictCode = exports2.showConflicts = exports2.END_MARKER = exports2.conflictStrings = exports2.PEACE = exports2.CONFLICT_DELETED_RIGHT = exports2.CONFLICT_DELETED_LEFT = exports2.CONFLICT_ADDED_BOTH = exports2.CONFLICT_ADDED_RIGHT = exports2.CONFLICT_ADDED_LEFT = exports2.mergeStates = exports2.updateState = exports2.currentLines = exports2.initialState = void 0;
    exports2.writeHydrationArtifact = exports2.updateHydrationPipelineStage = exports2.saveHydrationPipelineRun = exports2.resolveHydrationRunDirectory = exports2.probeHydrationRuntimeReadiness = exports2.probeHydrationOptionalAiDependency = exports2.probeHydrationChromaHeartbeat = exports2.parseHydrationChromaUrl = exports2.markStageArtifactWritten = exports2.loadHydrationPrompts = exports2.loadConflictPrompts = exports2.loadHydrationPipelineRun = exports2.loadHydrationChromaModule = exports2.isHydrationIndexStateCompatible = exports2.getHydrationChromaCollection = exports2.formatHydrationPromptTemplate = exports2.finalizeHydrationPipelineRun = exports2.defaultHydrationRunId = exports2.createHydrationQuestionPlan = exports2.createHydrationPipelineRun = exports2.createHydrationCycleState = exports2.createHydrationBranchIntentCollection = exports2.createDefaultHydrationPipelineStages = exports2.buildHydrationSynthesisPrompt = exports2.buildGuidedQuestionGenerationPrompt = exports2.buildHydrationRetrievalMerge = exports2.createHydrationChromaClient = exports2.buildMissingOptionalAiDependencySkipResult = exports2.HydrationRepository = exports2.HydrationIndexer = exports2.HYDRATION_PIPELINE_STAGE_IDS = exports2.HYDRATION_OPTIONAL_AI_EXIT_CODE = exports2.HYDRATION_PIPELINE_VERSION = exports2.HYDRATION_PIPELINE_SCHEMA = exports2.HYDRATION_OPTIONAL_DEPENDENCY_GROUP = exports2.HYDRATION_CHROMADB_NPM_PACKAGE = exports2.HYDRATION_INTENT_RESULT_SCHEMA = exports2.hydrateTonicAnnotatedAuthorIntent = void 0;
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
    var hydration_1 = require_hydration();
    Object.defineProperty(exports2, "HYDRATION_INTENT_RESULT_SCHEMA", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_INTENT_RESULT_SCHEMA;
    } });
    Object.defineProperty(exports2, "HYDRATION_CHROMADB_NPM_PACKAGE", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_CHROMADB_NPM_PACKAGE;
    } });
    Object.defineProperty(exports2, "HYDRATION_OPTIONAL_DEPENDENCY_GROUP", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_OPTIONAL_DEPENDENCY_GROUP;
    } });
    Object.defineProperty(exports2, "HYDRATION_PIPELINE_SCHEMA", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_PIPELINE_SCHEMA;
    } });
    Object.defineProperty(exports2, "HYDRATION_PIPELINE_VERSION", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_PIPELINE_VERSION;
    } });
    Object.defineProperty(exports2, "HYDRATION_OPTIONAL_AI_EXIT_CODE", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_OPTIONAL_AI_EXIT_CODE;
    } });
    Object.defineProperty(exports2, "HYDRATION_PIPELINE_STAGE_IDS", { enumerable: true, get: function() {
      return hydration_1.HYDRATION_PIPELINE_STAGE_IDS;
    } });
    Object.defineProperty(exports2, "HydrationIndexer", { enumerable: true, get: function() {
      return hydration_1.HydrationIndexer;
    } });
    Object.defineProperty(exports2, "HydrationRepository", { enumerable: true, get: function() {
      return hydration_1.HydrationRepository;
    } });
    Object.defineProperty(exports2, "buildMissingOptionalAiDependencySkipResult", { enumerable: true, get: function() {
      return hydration_1.buildMissingOptionalAiDependencySkipResult;
    } });
    Object.defineProperty(exports2, "createHydrationChromaClient", { enumerable: true, get: function() {
      return hydration_1.createHydrationChromaClient;
    } });
    Object.defineProperty(exports2, "buildHydrationRetrievalMerge", { enumerable: true, get: function() {
      return hydration_1.buildHydrationRetrievalMerge;
    } });
    Object.defineProperty(exports2, "buildGuidedQuestionGenerationPrompt", { enumerable: true, get: function() {
      return hydration_1.buildGuidedQuestionGenerationPrompt;
    } });
    Object.defineProperty(exports2, "buildHydrationSynthesisPrompt", { enumerable: true, get: function() {
      return hydration_1.buildHydrationSynthesisPrompt;
    } });
    Object.defineProperty(exports2, "createDefaultHydrationPipelineStages", { enumerable: true, get: function() {
      return hydration_1.createDefaultHydrationPipelineStages;
    } });
    Object.defineProperty(exports2, "createHydrationBranchIntentCollection", { enumerable: true, get: function() {
      return hydration_1.createHydrationBranchIntentCollection;
    } });
    Object.defineProperty(exports2, "createHydrationCycleState", { enumerable: true, get: function() {
      return hydration_1.createHydrationCycleState;
    } });
    Object.defineProperty(exports2, "createHydrationPipelineRun", { enumerable: true, get: function() {
      return hydration_1.createHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "createHydrationQuestionPlan", { enumerable: true, get: function() {
      return hydration_1.createHydrationQuestionPlan;
    } });
    Object.defineProperty(exports2, "defaultHydrationRunId", { enumerable: true, get: function() {
      return hydration_1.defaultHydrationRunId;
    } });
    Object.defineProperty(exports2, "finalizeHydrationPipelineRun", { enumerable: true, get: function() {
      return hydration_1.finalizeHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "formatHydrationPromptTemplate", { enumerable: true, get: function() {
      return hydration_1.formatHydrationPromptTemplate;
    } });
    Object.defineProperty(exports2, "getHydrationChromaCollection", { enumerable: true, get: function() {
      return hydration_1.getHydrationChromaCollection;
    } });
    Object.defineProperty(exports2, "isHydrationIndexStateCompatible", { enumerable: true, get: function() {
      return hydration_1.isHydrationIndexStateCompatible;
    } });
    Object.defineProperty(exports2, "loadHydrationChromaModule", { enumerable: true, get: function() {
      return hydration_1.loadHydrationChromaModule;
    } });
    Object.defineProperty(exports2, "loadHydrationPipelineRun", { enumerable: true, get: function() {
      return hydration_1.loadHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "loadConflictPrompts", { enumerable: true, get: function() {
      return hydration_1.loadConflictPrompts;
    } });
    Object.defineProperty(exports2, "loadHydrationPrompts", { enumerable: true, get: function() {
      return hydration_1.loadHydrationPrompts;
    } });
    Object.defineProperty(exports2, "markStageArtifactWritten", { enumerable: true, get: function() {
      return hydration_1.markStageArtifactWritten;
    } });
    Object.defineProperty(exports2, "parseHydrationChromaUrl", { enumerable: true, get: function() {
      return hydration_1.parseHydrationChromaUrl;
    } });
    Object.defineProperty(exports2, "probeHydrationChromaHeartbeat", { enumerable: true, get: function() {
      return hydration_1.probeHydrationChromaHeartbeat;
    } });
    Object.defineProperty(exports2, "probeHydrationOptionalAiDependency", { enumerable: true, get: function() {
      return hydration_1.probeHydrationOptionalAiDependency;
    } });
    Object.defineProperty(exports2, "probeHydrationRuntimeReadiness", { enumerable: true, get: function() {
      return hydration_1.probeHydrationRuntimeReadiness;
    } });
    Object.defineProperty(exports2, "resolveHydrationRunDirectory", { enumerable: true, get: function() {
      return hydration_1.resolveHydrationRunDirectory;
    } });
    Object.defineProperty(exports2, "saveHydrationPipelineRun", { enumerable: true, get: function() {
      return hydration_1.saveHydrationPipelineRun;
    } });
    Object.defineProperty(exports2, "updateHydrationPipelineStage", { enumerable: true, get: function() {
      return hydration_1.updateHydrationPipelineStage;
    } });
    Object.defineProperty(exports2, "writeHydrationArtifact", { enumerable: true, get: function() {
      return hydration_1.writeHydrationArtifact;
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
var import_core11 = __toESM(require_dist());

// src/commands/applyReportToWorkspace.ts
var vscode2 = __toESM(require("vscode"));
var import_core2 = __toESM(require_dist());

// src/gitMergeReconstruct.ts
var vscode = __toESM(require("vscode"));
var import_core = __toESM(require_dist());
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
var import_core3 = __toESM(require_dist());
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
var import_core4 = __toESM(require_dist());
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
var import_core6 = __toESM(require_dist());

// src/config/conflictLabelConfig.ts
var vscode5 = __toESM(require("vscode"));
var import_core5 = __toESM(require_dist());
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
var import_core7 = __toESM(require_dist());
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
var import_core8 = __toESM(require_dist());
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
var import_core10 = __toESM(require_dist());

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
var import_core9 = __toESM(require_dist());
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
  return await new Promise((resolve, reject) => {
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
      resolve(stdout.trim());
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
