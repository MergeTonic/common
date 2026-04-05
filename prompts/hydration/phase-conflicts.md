---
id: hydration.phase_conflicts
template_key: phase_conflicts
role: user
variables:
  - conflict_regions_json
  - file_list
output_contract: plain text / JSON per consumer
---

List conflict regions and affected files. Order by path then start line.

Conflict regions (JSON):
{{conflict_regions_json}}

File list:
{{file_list}}
