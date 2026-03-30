import bundleJson from "./data/aiPrompts.v1.json";

export type ConflictPromptBundle = {
  schema_version: number;
  github_json_response_suffix: string;
  system_prompts: Record<"default" | "enhanced" | "context_aware", string>;
  conflict_user: Record<"default" | "enhanced" | "context_aware", string>;
  file_user: Record<"default" | "enhanced" | "context_aware", string>;
};

const bundle = bundleJson as ConflictPromptBundle;

export function loadConflictPrompts(): ConflictPromptBundle {
  return bundle;
}
