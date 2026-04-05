---
id: conflict.user.default
template_key: default
role: user
variables:
  - path
  - start_line
  - end_line
  - kind_suffix
  - left_label
  - right_label
  - left_content
  - right_content
output_contract: json-object
---

I need help resolving a Tonic merge conflict in the file: {{path}}

The file contains a conflict between line {{start_line}} and {{end_line}}{{kind_suffix}}:

LEFT ({{left_label}}):
```
{{left_content}}```

RIGHT ({{right_label}}):
```
{{right_content}}```

Resolve this conflict and provide only the final content that should replace the conflicting region. Preserve both sides' intent when possible. Do not include Tonic or Git conflict markers in your response.
