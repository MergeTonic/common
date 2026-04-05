import type { AstHydrationArtifactV1 } from "../astGrep/types";

const DEFAULT_MAX_MATCHES = 40;
const DEFAULT_MAX_MESSAGE_LEN = 240;

/** Compact AST match list for question-refinement templates (bounded JSON text). */
export function formatAstMatchesExcerptJson(
  ast: AstHydrationArtifactV1 | null,
  env: NodeJS.ProcessEnv,
): string {
  if (!ast || ast.matches.length === 0) {
    return "[]";
  }
  const maxMatches = Math.max(
    1,
    parseInt(env.TONIC_AST_REFINEMENT_MAX_MATCHES ?? "", 10) || DEFAULT_MAX_MATCHES,
  );
  const maxMsg = Math.max(
    32,
    parseInt(env.TONIC_AST_REFINEMENT_MAX_MESSAGE_LEN ?? "", 10) || DEFAULT_MAX_MESSAGE_LEN,
  );
  const slice = ast.matches.slice(0, maxMatches);
  const brief = slice.map((m) => ({
    path: m.path,
    rule_id: m.rule_id,
    message: (m.message || "").slice(0, maxMsg),
    line: m.start?.line,
  }));
  return JSON.stringify(brief, null, 2);
}
