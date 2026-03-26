import { conflictCode, PEACE, showConflicts } from "./conflicts";
import { getDeletionsAndInsertions } from "./diff";
import { deserializeState, serializeState, type StateRow } from "./state";
import { mergeTrees, stateToTree, type StatusLine } from "./tree";

export function initialState(lines: string[], commitId?: string): string {
  return serializeState(
    lines.map((line, i): StateRow => [line, i, false, 1, commitId ? [commitId] : []]),
  );
}

export function currentLines(rawState: string): string[] {
  const state = deserializeState(rawState);
  return state.filter(([, , , count]) => count % 2).map(([line]) => line);
}

export function updateState(rawState: string, lines: string[], commitId?: string): string {
  let state = deserializeState(rawState);
  if (state.length === 0) {
    return initialState(lines);
  }
  const currentVisibleLines = state.filter(([, , , count]) => count % 2).map(([line]) => line);
  if (currentVisibleLines.length === lines.length && currentVisibleLines.every((v, i) => v === lines[i])) {
    return rawState;
  }
  const [deletions, insertions] = getDeletionsAndInsertions(
    state.map(([line]) => line),
    lines,
  );
  for (const deletion of deletions) {
    if (state[deletion]![3] % 2) {
      state[deletion]![3] += 1;
      if (commitId) {
        state[deletion]![4].push(commitId);
      }
    }
  }
  const deletedSet = new Set(deletions);
  for (let i = 0; i < state.length; i++) {
    if (!deletedSet.has(i) && state[i]![3] % 2 === 0) {
      state[i]![3] += 1;
      if (commitId) {
        state[i]![4].push(commitId);
      }
    }
  }
  const result: StateRow[] = [];
  let posInInsertions = 0;
  for (let pos = 0; pos <= state.length; pos++) {
    while (posInInsertions < insertions.length && insertions[posInInsertions]![0] === pos) {
      let up: boolean;
      if (pos === state.length) {
        up = true;
      } else if (pos === 0) {
        up = false;
      } else {
        up = state[pos - 1]![1] > state[pos]![1];
      }
      const newlines = insertions[posInInsertions]![1];
      if (up) {
        result.push([newlines[0]!, state[pos - 1]![1] + 1, false, 1, commitId ? [commitId] : []]);
      } else {
        result.push([newlines[0]!, state[pos]![1] + 1, true, 1, commitId ? [commitId] : []]);
      }
      for (let k = 1; k < newlines.length; k++) {
        result.push([newlines[k]!, result[result.length - 1]![1] + 1, false, 1, commitId ? [commitId] : []]);
      }
      posInInsertions += 1;
    }
    if (pos < state.length) {
      result.push(state[pos]!);
    }
  }
  return serializeState(result);
}

export function mergeStates(state1: string, state2: string): [string, string[]] {
  const tree1 = stateToTree(deserializeState(state1));
  const tree2 = stateToTree(deserializeState(state2));
  const statusLines: StatusLine[] = [];
  mergeTrees(statusLines, tree1, tree2, false);
  const resultLines: [string, number][] = [];
  let begin = 0;
  for (let i = 0; i <= statusLines.length; i++) {
    if (
      i === statusLines.length ||
      (statusLines[i]![5] && statusLines[i]![6] && statusLines[i]![0].trim() !== "")
    ) {
      let foundAdd = false;
      let hitLeft = false;
      let hitRight = false;
      for (let j = begin; j < i; j++) {
        const [, , , inChild, , onLeft, onRight] = statusLines[j]!;
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
          const [line, , , inChild, , onLeft, onRight] = statusLines[j]!;
          if (onLeft || onRight) {
            resultLines.push([line, conflictCode(Boolean(inChild % 2), onLeft, onRight)]);
          }
        }
      } else {
        for (let j = begin; j < i; j++) {
          const [line, , , inChild, , , ,] = statusLines[j]!;
          if (inChild % 2) {
            resultLines.push([line, PEACE]);
          }
        }
      }
      if (i < statusLines.length) {
        resultLines.push([statusLines[i]![0], PEACE]);
      }
      begin = i + 1;
    }
  }
  const serialized = serializeState(statusLines.map((x) => x.slice(0, 5) as StateRow));
  return [serialized, showConflicts(resultLines)];
}
