---
id: hydration.phase_structure
template_key: phase_structure
role: user
variables:
  - repo_structure_excerpt
  - prior_run_summary
output_contract: plain text / JSON per consumer
---

Summarize how repository layout relates to the merge. Use only the excerpt below.

Repository structure (excerpt):
{{repo_structure_excerpt}}

Prior run summary (may be empty):
{{prior_run_summary}}
