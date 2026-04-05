import type { RetrievalHit } from "../hydrationTypes";

/** Lexical regex over hit document text (query-time only; not structural ast-grep). */
export function regexSearchHits(hits: RetrievalHit[], pattern: string): RetrievalHit[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return [];
  }
  return hits.filter((h) => re.test(h.text));
}
