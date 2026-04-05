import type { RetrievalHit } from "../hydrationTypes";

const MAX_PATTERN_LENGTH = 200;

/** Returns a sanitized pattern string, or null if the pattern must not be used. */
function sanitizeRegexPattern(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_PATTERN_LENGTH) {
    return null;
  }
  const dangerousPatterns: RegExp[] = [
    /\((?:[^()\\]|\\.)+\)\s*\+\s*\+/,
    /\((?:[^()\\]|\\.)+\)\s*\*\s*\+/,
    /\((?:[^()\\]|\\.)+\)\s*\+\s*\*/,
    /\(\s*\.\s*\+\s*\)\s*\+/,
  ];
  for (const re of dangerousPatterns) {
    if (re.test(trimmed)) {
      return null;
    }
  }
  return trimmed;
}

/** Lexical regex over hit document text (query-time only; not structural ast-grep). */
export function regexSearchHits(hits: RetrievalHit[], pattern: string): RetrievalHit[] {
  const safePattern = sanitizeRegexPattern(pattern);
  if (!safePattern) {
    return [];
  }
  let re: RegExp;
  try {
    re = new RegExp(safePattern, "i");
  } catch {
    return [];
  }
  return hits.filter((h) => re.test(h.text));
}
