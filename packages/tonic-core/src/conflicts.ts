export const CONFLICT_ADDED_LEFT = 0;
export const CONFLICT_ADDED_RIGHT = 1;
export const CONFLICT_ADDED_BOTH = 2;
export const CONFLICT_DELETED_LEFT = 3;
export const CONFLICT_DELETED_RIGHT = 4;
export const PEACE = 5;

export const conflictStrings = [
  "added left",
  "added right",
  "added both",
  "deleted left",
  "deleted right",
  "deleted both",
];

export const END_MARKER = ">>>>>>> end conflict";

export function showConflicts(resultLines: [string, number][]): string[] {
  const finalResult: string[] = [];
  let lastState = PEACE;
  for (const [line, newState] of resultLines) {
    if (newState === PEACE) {
      if (lastState !== PEACE) {
        finalResult.push(END_MARKER);
      }
    } else if (lastState === PEACE) {
      finalResult.push("<<<<<<< begin " + conflictStrings[newState]!);
    } else if (lastState !== newState) {
      finalResult.push("======= begin " + conflictStrings[newState]!);
    }
    finalResult.push(line);
    lastState = newState;
  }
  if (lastState !== PEACE) {
    finalResult.push(END_MARKER);
  }
  return finalResult;
}

export function conflictCode(in_child: boolean, on_left: boolean, on_right: boolean): number {
  if (!on_left && !on_right) {
    throw new Error("conflictCode requires on_left or on_right");
  }
  if (in_child) {
    if (on_left && on_right) {
      return CONFLICT_ADDED_BOTH;
    }
    if (on_left) {
      return CONFLICT_ADDED_LEFT;
    }
    return CONFLICT_ADDED_RIGHT;
  }
  if (on_right) {
    return CONFLICT_DELETED_LEFT;
  }
  return CONFLICT_DELETED_RIGHT;
}
