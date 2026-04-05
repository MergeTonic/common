---
id: conflict.file.default
template_key: default
role: user
variables:
  - path
  - conflict_count
  - conflicts_body
output_contract: json-object
---

I need help resolving Tonic merge conflicts in the file: {{path}}

The file has {{conflict_count}} conflict(s):

{{conflicts_body}}Provide the entire resolved file content. Preserve intent from both sides when possible. Do not include conflict markers in your response.
