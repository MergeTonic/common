import type { RetrievalHit } from "../hydrationTypes";

/** Map repo-relative paths to ast-grep match line numbers. */
export type AstLineMap = Map<string, Set<number>>;

export function buildAstLineMapFromMatches(
  matches: Array<{ path: string; start?: { line?: number }; end?: { line?: number } }>,
): AstLineMap {
  const m: AstLineMap = new Map();
  for (const x of matches) {
    const p = x.path.replace(/\\/g, "/");
    const lo = x.start?.line ?? 1;
    const hi = Math.max(lo, x.end?.line ?? lo);
    const set = m.get(p) ?? new Set<number>();
    for (let ln = lo; ln <= hi; ln++) {
      set.add(ln);
    }
    m.set(p, set);
  }
  return m;
}

export function buildConflictMidLineMap(regions: Array<{ path: string; mid_line?: number }>): Map<string, number[]> {
  const map = new Map<string, number[]>();
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

/**
 * Boost scores using overlap between hit line span and ast-grep spans; optional conflict mid-line proximity.
 */
export function attachAstMetadata(
  hits: RetrievalHit[],
  astPathsToLines: AstLineMap,
  conflictMidLines?: Map<string, number[]>,
  opts?: { alpha?: number; proximityLines?: number; proximityBoost?: number },
): RetrievalHit[] {
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
    let nearest: string | undefined;

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
        nearest_conflict_region_id: nearest,
      },
    };
  });
}
