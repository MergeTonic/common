"""`--phase` milestones for merge-tonic hydrate (parity with TS hydrationPhase.ts)."""

from __future__ import annotations

HYDRATE_PHASE_ALL = 100

HYDRATE_PHASE_CONFLICTS = 0
HYDRATE_PHASE_INTENT_BOOTSTRAP = 1
HYDRATE_PHASE_REPO_STRUCTURE = 2
HYDRATE_PHASE_AST_GREP = 3
HYDRATE_PHASE_QUESTION_REFINEMENT = 4
HYDRATE_PHASE_RETRIEVAL = 5
HYDRATE_PHASE_CODE_WALK = 6

_ALIASES: dict[str, int] = {
    "all": HYDRATE_PHASE_ALL,
    "conflicts": HYDRATE_PHASE_CONFLICTS,
    "intent-bootstrap": HYDRATE_PHASE_INTENT_BOOTSTRAP,
    "bootstrap": HYDRATE_PHASE_INTENT_BOOTSTRAP,
    "question-refinement": HYDRATE_PHASE_QUESTION_REFINEMENT,
    "refinement": HYDRATE_PHASE_QUESTION_REFINEMENT,
    "repo-structure": HYDRATE_PHASE_REPO_STRUCTURE,
    "structure": HYDRATE_PHASE_REPO_STRUCTURE,
    "ast": HYDRATE_PHASE_AST_GREP,
    "ast-grep": HYDRATE_PHASE_AST_GREP,
    "ast_grep": HYDRATE_PHASE_AST_GREP,
    "retrieval": HYDRATE_PHASE_RETRIEVAL,
    "code-walk": HYDRATE_PHASE_CODE_WALK,
    "code_walk": HYDRATE_PHASE_CODE_WALK,
    "codewalk": HYDRATE_PHASE_CODE_WALK,
    "intent-bundle": HYDRATE_PHASE_ALL,
    "intent_bundle": HYDRATE_PHASE_ALL,
}


def parse_hydrate_phase(raw: str | None) -> tuple[int, str | None]:
    """Returns (max_level, error_message). error_message set when invalid."""
    s = (raw or "").strip()
    if not s:
        return (HYDRATE_PHASE_ALL, None)
    k = s.lower()
    if k not in _ALIASES:
        return (
            -1,
            (
                f'merge-tonic hydrate: unknown --phase "{raw}". Expected: all | conflicts | intent-bootstrap | '
                "structure | question-refinement | ast | retrieval | code-walk | intent-bundle"
            ),
        )
    return (_ALIASES[k], None)
