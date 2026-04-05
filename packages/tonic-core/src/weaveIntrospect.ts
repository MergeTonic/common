import type { StateRow } from "./state";

export type WeaveRowView = {
  weave_index: number;
  line: string;
  depth: number;
  anchored_right: boolean;
  count: number;
  provenance: string[];
  visible: boolean;
  visible_line: number | null;
};

export function buildVisibleWeaveMaps(rows: StateRow[]): {
  views: WeaveRowView[];
  visibleToWeave: number[];
  weaveToVisible: Map<number, number>;
} {
  const views: WeaveRowView[] = [];
  const visibleToWeave: number[] = [];
  const weaveToVisible = new Map<number, number>();
  let visibleCounter = 0;
  for (let i = 0; i < rows.length; i++) {
    const [line, depth, anchoredRight, count, provenance] = rows[i]!;
    let vl: number | null = null;
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
      visible_line: vl,
    });
  }
  return { views, visibleToWeave, weaveToVisible };
}

export function visibleLineCount(rows: StateRow[]): number {
  return rows.filter((r) => r[3] % 2).length;
}

export class WeaveIntrospectError extends Error {
  override name = "WeaveIntrospectError";
}

export function visibleRangeToWeaveIndices(
  rows: StateRow[],
  startVisible: number,
  endVisible: number,
): number[] {
  const nVis = visibleLineCount(rows);
  if (startVisible < 1 || endVisible < startVisible || endVisible > nVis) {
    throw new WeaveIntrospectError(
      `visible range [${startVisible}, ${endVisible}] invalid for ${nVis} visible lines`,
    );
  }
  const { visibleToWeave } = buildVisibleWeaveMaps(rows);
  return visibleToWeave.slice(startVisible - 1, endVisible);
}

export function splitWeaveIndexAfterVisible(rows: StateRow[], afterVisible: number): number {
  const nVis = visibleLineCount(rows);
  if (afterVisible < 0 || afterVisible > nVis) {
    throw new WeaveIntrospectError(
      `after_visible ${afterVisible} out of range for ${nVis} visible lines`,
    );
  }
  if (afterVisible === 0) {
    return 0;
  }
  if (afterVisible === nVis) {
    return rows.length;
  }
  let visibleCounter = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row[3] % 2) {
      visibleCounter += 1;
      if (visibleCounter === afterVisible) {
        return i + 1;
      }
    }
  }
  throw new WeaveIntrospectError("internal: could not resolve after_visible");
}

export function inspectRowsJson(rows: StateRow[]): {
  rows: WeaveRowView[];
  visible_to_weave: number[];
  weave_to_visible: Record<string, number>;
} {
  const { views, visibleToWeave, weaveToVisible } = buildVisibleWeaveMaps(rows);
  const weaveToVisibleObj: Record<string, number> = {};
  for (const [k, v] of [...weaveToVisible.entries()].sort((a, b) => a[0] - b[0])) {
    weaveToVisibleObj[String(k)] = v;
  }
  return {
    rows: views,
    visible_to_weave: visibleToWeave,
    weave_to_visible: weaveToVisibleObj,
  };
}
