---
id: hydration.subquestion_generator
template_key: subquestion_generator
role: user
variables:
  - left_intent
  - right_intent
  - conflict_regions_json
  - repo_structure_excerpt
  - prior_refinement_pass_label
  - prior_phases_digest
  - user_query
  - follow_up
  - conflict_hunks_excerpt_json
  - ast_matches_excerpt_json
  - retrieval_hits_pre_r1_json
  - retrieval_hits_pass2_json
  - repo_head_short
  - merge_branch_hints
output_contract: JSON with key subquestions array of {id, text, priority}
---

Propose focused subquestions to resolve the merge, using conflict geometry, hunk excerpts, AST matches, and retrieval hits when present.

Left intent:
{{left_intent}}

Right intent:
{{right_intent}}

User notes:
{{user_query}}

Follow-up:
{{follow_up}}

Refinement pass:
{{prior_refinement_pass_label}}

Repository head (short):
{{repo_head_short}}

Merge / branch hints:
{{merge_branch_hints}}

Repository structure (excerpt):
{{repo_structure_excerpt}}

Conflict regions (JSON):
{{conflict_regions_json}}

Conflict hunk excerpts (JSON):
{{conflict_hunks_excerpt_json}}

AST matches (excerpt JSON):
{{ast_matches_excerpt_json}}

Pre-refinement retrieval hits (JSON):
{{retrieval_hits_pre_r1_json}}

Pass-2 delta retrieval hits (JSON; use when not `[]`):
{{retrieval_hits_pass2_json}}

Prior digest (debug only; may be empty):
{{prior_phases_digest}}

Respond with JSON only, per the system instructions.
