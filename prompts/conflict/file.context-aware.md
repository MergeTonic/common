---
id: conflict.file.context_aware
template_key: context-aware
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

{{conflicts_body}}Compare to BASE per region when present; produce one coherent resolved file.
