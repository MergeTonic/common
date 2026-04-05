import type { RetrievalHit } from "../hydrationTypes";

/** Filter hits by ast_rule_id / symbol metadata (lexical over stored chunk metadata). */
export function symbolSearchHits(hits: RetrievalHit[], symbol: string): RetrievalHit[] {
  const s = symbol.trim().toLowerCase();
  if (!s) {
    return hits;
  }
  return hits.filter((h) => {
    const rule = String(h.metadata?.ast_rule_id ?? "").toLowerCase();
    const sym = String(h.metadata?.symbol ?? "").toLowerCase();
    return rule.includes(s) || sym.includes(s);
  });
}
