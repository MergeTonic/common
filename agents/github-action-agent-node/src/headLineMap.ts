import type { ConflictRegion } from "@mergetonic/core";

export type HeadSpanResult =
  | { kind: "unique"; span: [number, number] }
  | { kind: "ambiguous"; candidates: number[] }
  | { kind: "unmapped" };

export function findSublistStarts(haystack: string[], needle: string[]): number[] {
  if (!needle.length || needle.length > haystack.length) {
    return [];
  }
  const out: number[] = [];
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      out.push(i);
    }
  }
  return out;
}

function linesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function refineMatches(
  matches: number[],
  rightLines: string[],
  region: ConflictRegion,
): number[] {
  if (matches.length <= 1) {
    return matches;
  }
  const rawLeft = (region.leftContent ?? "").split(/\r?\n/);
  if (!rawLeft.length) {
    return [];
  }
  const lastL = rawLeft[rawLeft.length - 1] ?? "";
  return matches.filter((m) => m > 0 && rightLines[m - 1] === lastL);
}

function disambiguateByPosition(matches: number[], preferAfterLine0: number | undefined): number[] {
  if (matches.length <= 1 || preferAfterLine0 === undefined) {
    return matches;
  }
  const forward = matches.filter((m) => m >= preferAfterLine0);
  return forward.length ? forward : matches;
}

/**
 * Map a conflict region to 1-based inclusive [start, end] on the head file.
 * Returns structured outcome so callers can post orphan/ambiguous follow-ups.
 */
export function conflictRegionToHeadSpanResult(
  region: ConflictRegion,
  rightLines: string[],
  preferAfterLine0?: number,
): HeadSpanResult {
  if (!rightLines.length) {
    return { kind: "unmapped" };
  }

  const rc = region.rightContent ? region.rightContent.split(/\r?\n/) : [];

  if (rc.length) {
    if (rc.length === rightLines.length && linesEqual(rc, rightLines)) {
      return { kind: "unique", span: [1, rightLines.length] };
    }

    let matches = findSublistStarts(rightLines, rc);
    if (matches.length > 1) {
      matches = refineMatches(matches, rightLines, region);
    }
    matches = disambiguateByPosition(matches, preferAfterLine0);
    if (matches.length > 1) {
      if (preferAfterLine0 !== undefined) {
        const forward = matches.filter((m) => m >= preferAfterLine0);
        if (forward.length === 1) {
          const i0 = forward[0]!;
          return { kind: "unique", span: [i0 + 1, i0 + rc.length] };
        }
      }
      return { kind: "ambiguous", candidates: matches.slice() };
    }
    if (matches.length !== 1) {
      return { kind: "unmapped" };
    }
    const i0 = matches[0]!;
    return { kind: "unique", span: [i0 + 1, i0 + rc.length] };
  }

  const lcAll = region.leftContent ? region.leftContent.split(/\r?\n/) : [];
  if (!lcAll.length) {
    return { kind: "unmapped" };
  }

  if (lcAll.length === rightLines.length && linesEqual(lcAll, rightLines)) {
    return { kind: "unique", span: [1, rightLines.length] };
  }

  let matches = findSublistStarts(rightLines, lcAll);
  if (matches.length > 1) {
    matches = refineMatches(matches, rightLines, region);
  }
  matches = disambiguateByPosition(matches, preferAfterLine0);
  if (matches.length > 1) {
    if (preferAfterLine0 !== undefined) {
      const forward = matches.filter((m) => m >= preferAfterLine0);
      if (forward.length === 1) {
        const i0 = forward[0]!;
        return { kind: "unique", span: [i0 + 1, i0 + lcAll.length] };
      }
    }
    if (lcAll.length === 1) {
      return { kind: "ambiguous", candidates: matches.slice() };
    }
    return { kind: "ambiguous", candidates: matches.slice() };
  }
  if (matches.length !== 1) {
    if (lcAll.length === 1) {
      const line = lcAll[0]!;
      const indices = rightLines
        .map((x, i) => (x === line ? i : -1))
        .filter((i) => i >= 0);
      if (indices.length === 1) {
        const idx = indices[0]!;
        return { kind: "unique", span: [idx + 1, idx + 1] };
      }
      if (indices.length > 1) {
        return { kind: "ambiguous", candidates: indices };
      }
      return { kind: "unmapped" };
    }
    return { kind: "unmapped" };
  }
  const i0 = matches[0]!;
  return { kind: "unique", span: [i0 + 1, i0 + lcAll.length] };
}

/** 1-based inclusive [start, end] in head file, or null (unique match only). */
export function conflictRegionToHeadSpan(
  region: ConflictRegion,
  rightLines: string[],
  preferAfterLine0?: number,
): [number, number] | null {
  const r = conflictRegionToHeadSpanResult(region, rightLines, preferAfterLine0);
  return r.kind === "unique" ? r.span : null;
}
