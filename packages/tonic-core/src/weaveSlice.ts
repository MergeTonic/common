import { deserializeState, serializeState, type StateRow } from "./state";
import { stateToTree } from "./tree";

export class WeaveExtractError extends Error {
  override name = "WeaveExtractError";
}

export class WeaveSpliceError extends Error {
  override name = "WeaveSpliceError";
}

function validateWeaveRows(rows: StateRow[]): void {
  try {
    stateToTree(rows);
  } catch (e) {
    throw new WeaveExtractError(
      "weave rows are not a structurally valid fragment (parent/depth chain broken)",
      { cause: e },
    );
  }
}

export function extractWeaveRows(
  rawState: string,
  weaveStart: number,
  weaveEnd: number,
  options: { allowEmpty?: boolean } = {},
): string {
  const rows = deserializeState(rawState);
  const { allowEmpty = false } = options;
  if (weaveStart < 0 || weaveEnd > rows.length || weaveStart > weaveEnd) {
    throw new WeaveExtractError(
      `invalid range [${weaveStart}, ${weaveEnd}) for ${rows.length} weave rows`,
    );
  }
  if (weaveStart === weaveEnd) {
    if (allowEmpty) {
      return "";
    }
    throw new WeaveExtractError("empty extract range (use allowEmpty: true if intentional)");
  }
  const sub = rows.slice(weaveStart, weaveEnd);
  const minD = Math.min(...sub.map((r) => r[1]!));
  const shifted: StateRow[] = sub.map(([line, d, ar, c, p]) => [
    line,
    d - minD,
    ar,
    c,
    [...p],
  ]);
  validateWeaveRows(shifted);
  return serializeState(shifted);
}

export function spliceWeaveRows(targetRaw: string, fragmentRaw: string, splitWeaveIndex: number): string {
  const target = deserializeState(targetRaw);
  const fragment = deserializeState(fragmentRaw);
  if (splitWeaveIndex < 0 || splitWeaveIndex > target.length) {
    throw new WeaveSpliceError(
      `splitWeaveIndex ${splitWeaveIndex} out of range for ${target.length} target rows`,
    );
  }
  if (fragment.length === 0) {
    return targetRaw;
  }
  const fragMin = Math.min(...fragment.map((r) => r[1]!));
  const depthOff =
    splitWeaveIndex === 0 ? -fragMin : target[splitWeaveIndex - 1]![1] - fragMin;
  const adjusted: StateRow[] = fragment.map(([line, d, ar, c, p]) => [
    line,
    d + depthOff,
    ar,
    c,
    [...p],
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
  return serializeState(merged);
}
