import type { ConflictFile, ConflictRegion } from "@mergetonic/core";

import bundleJson from "./data/aiPrompts.v1.json";

type BundleV1 = {
  schema_version: number;
  github_json_response_suffix: string;
  system_prompts: Record<"default" | "enhanced" | "context_aware", string>;
  conflict_user: Record<"default" | "enhanced" | "context_aware", string>;
  file_user: Record<"default" | "enhanced" | "context_aware", string>;
};

const bundle = bundleJson as BundleV1;

export type PromptTemplateEnv = "default" | "enhanced" | "context-aware";

function bundleKey(t: PromptTemplateEnv): keyof BundleV1["system_prompts"] {
  if (t === "context-aware") {
    return "context_aware";
  }
  return t;
}

export function promptTemplateFromEnv(): PromptTemplateEnv {
  const raw = (process.env.TONIC_AGENT_PROMPT_TEMPLATE ?? "enhanced")
    .toLowerCase()
    .trim();
  if (raw === "default") {
    return "default";
  }
  if (raw === "context-aware" || raw === "context_aware" || raw === "contextaware") {
    return "context-aware";
  }
  return "enhanced";
}

function formatTpl(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : `{${key}}`,
  );
}

export function githubJsonResponseSuffix(): string {
  return bundle.github_json_response_suffix;
}

export function buildSystemPromptBody(template: PromptTemplateEnv): string {
  return bundle.system_prompts[bundleKey(template)];
}

export function determineFileType(filePath: string): string {
  if (!filePath.includes(".")) {
    return "Unknown file type";
  }
  const extension = filePath.split(".").pop()!.toLowerCase();
  switch (extension) {
    case "rs":
      return "Rust";
    case "js":
      return "JavaScript";
    case "ts":
      return "TypeScript";
    case "py":
      return "Python";
    case "md":
      return "Markdown";
    case "json":
      return "JSON";
    case "yml":
    case "yaml":
      return "YAML";
    case "toml":
      return "TOML";
    default:
      return `File with .${extension} extension`;
  }
}

export function extractSurroundingContext(conflictFile: ConflictFile, conflict: ConflictRegion): string {
  if (!conflictFile.content) {
    return "";
  }
  const lines = conflictFile.content.split(/\r?\n/);
  const start = Math.max(0, conflict.startLine - 3);
  const end = Math.min(lines.length, conflict.endLine + 2);
  return lines.slice(start, end).join("\n");
}

export function buildConflictUserMessage(
  cf: ConflictFile,
  conflict: ConflictRegion,
  template: PromptTemplateEnv,
): string {
  const leftLabel = cf.leftLabel ?? "left";
  const rightLabel = cf.rightLabel ?? "right";
  const bk = bundleKey(template);
  const tpl = bundle.conflict_user[bk];

  if (template === "default") {
    const kindSuffix = conflict.conflictKind ? ` (${conflict.conflictKind})` : "";
    return formatTpl(tpl, {
      path: cf.path,
      start_line: String(conflict.startLine),
      end_line: String(conflict.endLine),
      kind_suffix: kindSuffix,
      left_label: leftLabel,
      right_label: rightLabel,
      left_content: conflict.leftContent ?? "",
      right_content: conflict.rightContent ?? "",
    });
  }

  if (template === "enhanced") {
    const kind = conflict.conflictKind || "unspecified";
    const ft = determineFileType(cf.path);
    return formatTpl(tpl, {
      path: cf.path,
      start_line: String(conflict.startLine),
      end_line: String(conflict.endLine),
      kind,
      file_type: ft,
      left_label: leftLabel,
      right_label: rightLabel,
      left_content: conflict.leftContent ?? "",
      right_content: conflict.rightContent ?? "",
    });
  }

  const baseSection =
    conflict.baseContent?.trim() ?
      `BASE VERSION (common ancestor):\n\`\`\`\n${conflict.baseContent}\`\`\`\n\n`
    : "";
  const surrounding = extractSurroundingContext(cf, conflict);
  const ctxSection = surrounding.trim()
    ? `SURROUNDING CONTEXT:\n\`\`\`\n${surrounding}\`\`\`\n\n`
    : "";
  const kind = conflict.conflictKind || "unspecified";
  const ft = determineFileType(cf.path);
  return formatTpl(tpl, {
    path: cf.path,
    start_line: String(conflict.startLine),
    end_line: String(conflict.endLine),
    kind,
    file_type: ft,
    base_section: baseSection,
    ctx_section: ctxSection,
    left_label: leftLabel,
    right_label: rightLabel,
    left_content: conflict.leftContent ?? "",
    right_content: conflict.rightContent ?? "",
  });
}

export function buildFileUserMessage(cf: ConflictFile, template: PromptTemplateEnv): string {
  const bk = bundleKey(template);
  const tpl = bundle.file_user[bk];
  const n = cf.conflicts.length;

  if (template === "default") {
    const parts: string[] = [];
    for (let i = 0; i < cf.conflicts.length; i++) {
      const c = cf.conflicts[i]!;
      parts.push(
        `CONFLICT ${i + 1}:\nBetween lines ${c.startLine} and ${c.endLine}\n` +
          `LEFT:\n\`\`\`\n${c.leftContent ?? ""}\`\`\`\n` +
          `RIGHT:\n\`\`\`\n${c.rightContent ?? ""}\`\`\`\n\n`,
      );
    }
    return formatTpl(tpl, {
      path: cf.path,
      conflict_count: String(n),
      conflicts_body: parts.join(""),
    });
  }

  if (template === "enhanced") {
    const ft = determineFileType(cf.path);
    const parts: string[] = [];
    for (let i = 0; i < cf.conflicts.length; i++) {
      const c = cf.conflicts[i]!;
      parts.push(
        `CONFLICT ${i + 1}:\n` +
          `- Location: Lines ${c.startLine} to ${c.endLine}\n` +
          `- Kind: ${c.conflictKind || "unspecified"}\n` +
          `LEFT:\n\`\`\`\n${c.leftContent ?? ""}\`\`\`\n` +
          `RIGHT:\n\`\`\`\n${c.rightContent ?? ""}\`\`\`\n\n`,
      );
    }
    return formatTpl(tpl, {
      path: cf.path,
      file_type: ft,
      conflict_count: String(n),
      conflicts_body: parts.join(""),
    });
  }

  const ft = determineFileType(cf.path);
  const parts: string[] = [];
  for (let i = 0; i < cf.conflicts.length; i++) {
    const c = cf.conflicts[i]!;
    const baseSec = c.baseContent?.trim() ? `BASE:\n\`\`\`\n${c.baseContent}\`\`\`\n` : "";
    parts.push(
      `CONFLICT ${i + 1}:\n` +
        `- Lines ${c.startLine} to ${c.endLine}\n` +
        `${baseSec}` +
        `LEFT:\n\`\`\`\n${c.leftContent ?? ""}\`\`\`\n` +
        `RIGHT:\n\`\`\`\n${c.rightContent ?? ""}\`\`\`\n\n`,
    );
  }
  return formatTpl(tpl, {
    path: cf.path,
    file_type: ft,
    conflict_count: String(n),
    conflicts_body: parts.join(""),
  });
}
