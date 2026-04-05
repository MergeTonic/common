# Conflict prompts (markdown source)

Author templates here with `{{variable}}` placeholders. Run `python scripts/generate_prompt_bundle.py` to merge into `agents/shared-tonic-ai-prompts/prompts.v1.json` as `system_prompts`, `conflict_user`, `file_user`, and `github_json_response_suffix` (placeholders are normalized to `{variable}` for runtime). Then run `python scripts/sync_agent_ai_prompts.py` to copy the bundle into both agents.

| File pattern | Bundle key |
| --- | --- |
| `system.{default,enhanced,context-aware}.md` | `system_prompts` |
| `user.{...}.md` | `conflict_user` |
| `file.{...}.md` | `file_user` |
| `github-json-response-suffix.md` | `github_json_response_suffix` |
