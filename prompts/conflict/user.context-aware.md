---
id: conflict.user.context_aware
template_key: context-aware
role: user
variables:
  - path
  - start_line
  - end_line
  - kind
  - file_type
  - base_section
  - ctx_section
  - left_label
  - right_label
  - left_content
  - right_content
output_contract: json-object
---

I need help resolving a Tonic merge conflict in the file: {{path}}

CONFLICT DETAILS:
- Lines {{start_line}} to {{end_line}}
- Kind: {{kind}}
- File type: {{file_type}}

{{base_section}}{{ctx_section}}LEFT ({{left_label}}):
```
{{left_content}}```

RIGHT ({{right_label}}):
```
{{right_content}}```

Provide ONLY the final resolved code for this region, integrating with context.
