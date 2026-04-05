---
id: github_json_response_suffix
role: suffix
variables: []
output_contract: json-object
---


You MUST respond with a single JSON object only, no markdown fences, using this shape: {"resolved_lines": ["each line of the merged result"], "rationale": "one short sentence"}. Each element of resolved_lines must be one logical line of the file (no embedded newlines).
