import type { StateRow } from "./state";

/** Tree node: line, count, lowTrees, highTrees, depth; line null for root */
export type Tree = [string | null, number, string[], Tree[], Tree[], number];

export function stateToTree(state: StateRow[]): Tree {
  const rootChildrenAbove: number[] = [];
  const childrenAbove: number[][] = state.map(() => []);
  const lastByDepth: (number | null)[] = state.map(() => null);
  for (let i = 0; i < state.length; i++) {
    const [line, depth, anchored_right] = state[i]!;
    if (!anchored_right) {
      if (depth === 0) {
        rootChildrenAbove.push(i);
      } else {
        const parent = lastByDepth[depth - 1]!;
        childrenAbove[parent]!.push(i);
      }
    }
    lastByDepth[depth] = i;
  }

  const childrenBelow: number[][] = state.map(() => []);
  lastByDepth.fill(null);
  for (let i = state.length - 1; i >= 0; i--) {
    const [, depth, anchored_right] = state[i]!;
    if (anchored_right) {
      const parent = lastByDepth[depth - 1]!;
      childrenBelow[parent]!.push(i);
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
    -1,
  ];
}

function pullOutTree(
  pos: number,
  state: StateRow[],
  childrenAbove: number[][],
  childrenBelow: number[][],
): Tree {
  const [line, , , count, provenance] = state[pos]!;
  const depth = state[pos]![1];
  return [
    line,
    count,
    provenance,
    childrenBelow[pos]!.map((x) => pullOutTree(x, state, childrenAbove, childrenBelow)),
    childrenAbove[pos]!.map((x) => pullOutTree(x, state, childrenAbove, childrenBelow)),
    depth,
  ];
}

/** (line, depth, anchored_right, in_child, on_left, on_right) status line from merge */
export type StatusLine = [string, number, boolean, number, string[], boolean, boolean];

export function mergeTrees(output: StatusLine[], tree1: Tree, tree2: Tree, anchored_right: boolean): void {
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
      Boolean(count2 % 2),
    ]);
  }
  mergeTreeLists(output, hightrees1, hightrees2, false);
}

function mergeTreeLists(output: StatusLine[], leftTrees: Tree[], rightTrees: Tree[], anchored_right: boolean): void {
  let pos1 = 0;
  let pos2 = 0;
  while (pos1 < leftTrees.length || pos2 < rightTrees.length) {
    if (pos2 === rightTrees.length) {
      insertTree(output, leftTrees[pos1]!, false, anchored_right);
      pos1 += 1;
    } else if (pos1 === leftTrees.length) {
      insertTree(output, rightTrees[pos2]!, true, anchored_right);
      pos2 += 1;
    } else {
      const l = leftTrees[pos1]!;
      const r = rightTrees[pos2]!;
      const l0 = l[0]!;
      const r0 = r[0]!;
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

function insertTree(output: StatusLine[], tree: Tree, fromRight: boolean, anchored_right: boolean): void {
  const [line, count, provenance, lowtrees, hightrees, depth] = tree;
  for (const newTree of lowtrees) {
    insertTree(output, newTree, fromRight, true);
  }
  output.push([line!, depth, anchored_right, count, provenance, !fromRight, fromRight]);
  for (const newTree of hightrees) {
    insertTree(output, newTree, fromRight, false);
  }
}
