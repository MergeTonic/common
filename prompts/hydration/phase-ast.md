---
id: hydration.phase_ast
template_key: phase_ast
role: user
variables:
  - ast_matches_by_conflict_file
  - ruleset_id
  - prior_phases_digest
output_contract: plain text / JSON per consumer
---

Structural evidence from ast-grep (pre-sorted by consumer). Tie-break by path and rule id.

Ast matches by conflict file:
{{ast_matches_by_conflict_file}}

Ruleset id:
{{ruleset_id}}

Prior phases digest:
{{prior_phases_digest}}
