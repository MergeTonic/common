---
id: conflict.file.enhanced
template_key: enhanced
role: user
variables:
  - path
  - file_type
  - conflict_count
  - conflicts_body
output_contract: json-object
---

I need help resolving Tonic merge conflicts in: {{path}}

FILE DETAILS:
- File type: {{file_type}}
- Conflicts: {{conflict_count}}

CONFLICTS:

{{conflicts_body}}Provide ONLY the complete resolved file. No markers or commentary.
