---
id: hydration.intent_bootstrap
template_key: intent_bootstrap_user
role: user
variables:
  - left_intent
  - right_intent
  - repo_name
  - user_query
  - follow_up
---

Repository: {{repo_name}}.

Honor both merge sides. Left intent: {{left_intent}}. Right intent: {{right_intent}}.

User notes: {{user_query}}

Follow-up: {{follow_up}}
