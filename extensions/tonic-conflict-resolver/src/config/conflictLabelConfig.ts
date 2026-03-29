import * as vscode from "vscode";
import { parseConflictLabel } from "@mergetonic/core";

type PaletteName = "tonic" | "contrast";

type ConflictLabelRule = {
  kind?: string;
  tags?: Record<string, string>;
  backgroundColor: string;
};

type ConflictLabelConfig = {
  rules?: ConflictLabelRule[];
};

const PALETTES: Record<PaletteName, Record<string, string>> = {
  tonic: {
    "added left": "#fff3cd",
    "added right": "#cce5ff",
    "added both": "#d4edda",
    "deleted left": "#f8d7da",
    "deleted right": "#fce5cd",
    "deleted both": "#e2e3e5",
    "git merge": "#e7d9ff",
  },
  contrast: {
    "added left": "#ffe082",
    "added right": "#81d4fa",
    "added both": "#a5d6a7",
    "deleted left": "#ef9a9a",
    "deleted right": "#ffcc80",
    "deleted both": "#b0bec5",
    "git merge": "#ce93d8",
  },
};

function asPalette(value: string): PaletteName {
  switch (value) {
    case "contrast":
      return "contrast";
    case "tonic":
    default:
      return "tonic";
  }
}

function parseRules(value: unknown): ConflictLabelRule[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { rules?: unknown }).rules)) {
    return [];
  }
  const out: ConflictLabelRule[] = [];
  for (const raw of (value as { rules: unknown[] }).rules) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as {
      kind?: unknown;
      tags?: unknown;
      backgroundColor?: unknown;
    };
    if (typeof candidate.backgroundColor !== "string" || !candidate.backgroundColor.trim()) {
      continue;
    }
    const tags: Record<string, string> = {};
    if (candidate.tags && typeof candidate.tags === "object") {
      for (const [k, v] of Object.entries(candidate.tags as Record<string, unknown>)) {
        if (typeof v === "string") {
          tags[k] = v;
        }
      }
    }
    out.push({
      kind: typeof candidate.kind === "string" ? candidate.kind : undefined,
      tags,
      backgroundColor: candidate.backgroundColor.trim(),
    });
  }
  return out;
}

function tagsMatch(actual: Record<string, string>, expected: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      return false;
    }
  }
  return true;
}

export function semanticColorForLabel(label: string): string | undefined {
  const cfg = vscode.workspace.getConfiguration("tonic");
  const enabled = cfg.get<boolean>("highlight.enableSemantic", false);
  if (!enabled) {
    return undefined;
  }
  const paletteName = asPalette(cfg.get<string>("highlight.defaultPalette", "tonic"));
  const parsed = parseConflictLabel(label);
  const userRules = parseRules(cfg.get<ConflictLabelConfig | undefined>("conflictLabelConfig"));
  for (const rule of userRules) {
    const kindOk = !rule.kind || rule.kind === parsed.baseKind;
    const tagsOk = !rule.tags || tagsMatch(parsed.tags, rule.tags);
    if (kindOk && tagsOk) {
      return rule.backgroundColor;
    }
  }
  return PALETTES[paletteName][parsed.baseKind];
}
