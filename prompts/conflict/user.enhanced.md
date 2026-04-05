---
id: conflict.user.enhanced
template_key: enhanced
role: user
variables:
  - path
  - start_line
  - end_line
  - kind
  - file_type
  - left_label
  - right_label
  - left_content
  - right_content
output_contract: json-object
---

I need help resolving a Tonic merge conflict in the file: {{path}}

CONFLICT DETAILS:
- Location: Lines {{start_line}} to {{end_line}}
- Tonic kind: {{kind}}
- File type: {{file_type}}

LEFT ({{left_label}}):
```
{{left_content}}```

RIGHT ({{right_label}}):
```
{{right_content}}```

CONFLICT ANALYSIS:
Analyze semantic differences. Look for complementary changes, incompatible edits, and what each side is trying to accomplish.

RESOLUTION:
Provide ONLY the final resolved code for this region. No markers or explanations.
