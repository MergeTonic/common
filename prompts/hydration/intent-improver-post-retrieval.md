---
id: hydration.intent_improver_post_retrieval
template_key: intent_improver_post_retrieval
role: user
variables:
  - left_intent
  - right_intent
  - conflict_regions_json
  - repo_structure_excerpt
  - retrieval_hits_json
  - user_query
  - follow_up
output_contract: JSON refined intents informed by retrieval hits
---

Refine merge intents using the code retrieval evidence below. Ground claims in hits; do not invent file paths.

Left intent:
{{left_intent}}

Right intent:
{{right_intent}}

User notes:
{{user_query}}

Follow-up:
{{follow_up}}

Repository structure (excerpt):
{{repo_structure_excerpt}}

Conflict regions (JSON):
{{conflict_regions_json}}

Retrieval hits (JSON):
{{retrieval_hits_json}}

Respond with JSON only, per the system instructions.
