---
id: hydration.phase_intent_bundle
template_key: phase_intent_bundle
role: user
variables:
  - evidence_links
  - intent_profile
  - merge_request_context
output_contract: JSON per consumer
---

Final intent bundle context for resolution agents.

Evidence links:
{{evidence_links}}

Intent profile:
{{intent_profile}}

Merge / PR context:
{{merge_request_context}}
