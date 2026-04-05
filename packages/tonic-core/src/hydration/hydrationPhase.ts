/**
 * `--phase` for `merge-tonic hydrate`: inclusive prefix of pipeline milestones.
 * Conflicts scan + gate run first (level 0), then bootstrap → structure → AST →
 * question refinement (with pre-r1 retrieval embedded) → post-final retrieval → code walk.
 */

export const HYDRATE_PHASE_ALL = 100;

export const HYDRATE_PHASE_LEVEL = {
  conflicts: 0,
  intent_bootstrap: 1,
  repo_structure: 2,
  ast_grep: 3,
  question_refinement: 4,
  retrieval: 5,
  code_walk: 6,
} as const;

const ALIASES: Record<string, number> = {
  all: HYDRATE_PHASE_ALL,
  conflicts: 0,
  "intent-bootstrap": 1,
  bootstrap: 1,
  "repo-structure": 2,
  structure: 2,
  "question-refinement": 4,
  refinement: 4,
  ast: 3,
  "ast-grep": 3,
  ast_grep: 3,
  retrieval: 5,
  "code-walk": 6,
  code_walk: 6,
  codewalk: 6,
  /** Same as `all`: run optional retrieval/code-walk per flags, then intent bundle. */
  "intent-bundle": HYDRATE_PHASE_ALL,
  intent_bundle: HYDRATE_PHASE_ALL,
};

export function parseHydratePhase(raw: string | undefined): { ok: true; max: number } | { ok: false; message: string } {
  const s = (raw ?? "").trim();
  if (!s) {
    return { ok: true, max: HYDRATE_PHASE_ALL };
  }
  const k = s.toLowerCase();
  if (ALIASES[k] === undefined) {
    return {
      ok: false,
      message:
        'merge-tonic hydrate: unknown --phase "' +
        raw +
        '". Expected: all | conflicts | intent-bootstrap | structure | question-refinement | ast | retrieval | code-walk | intent-bundle',
    };
  }
  return { ok: true, max: ALIASES[k]! };
}
