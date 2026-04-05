---
id: hydration.phase_retrieval
template_key: phase_retrieval
role: user
variables:
  - retrieval_hits_json
  - source_mode
output_contract: plain text / JSON per consumer
---

Batch retrieval hits only (no tool transcripts).

Source mode:
{{source_mode}}

Retrieval hits (JSON):
{{retrieval_hits_json}}
