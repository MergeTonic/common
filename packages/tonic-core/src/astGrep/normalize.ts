import * as path from "node:path";

import type { NormalizedMatch, Position } from "./types";

export function toRepoRelativePosix(absOrRel: string, repoRoot: string): string {
  const norm = absOrRel.replace(/\\/g, "/");
  const root = path.resolve(repoRoot).replace(/\\/g, "/");
  let p = path.resolve(repoRoot, absOrRel).replace(/\\/g, "/");
  if (p.startsWith(root + "/") || p === root) {
    p = p.slice(root.length).replace(/^\//, "");
  } else if (!norm.includes("..")) {
    return norm.replace(/^\.\//, "");
  }
  return p;
}

function readPos(obj: unknown, key: string): Position | undefined {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const o = obj as Record<string, unknown>;
  const v = o[key];
  if (!v || typeof v !== "object") {
    return undefined;
  }
  const r = v as Record<string, unknown>;
  const line = typeof r.line === "number" ? r.line : Number(r.line);
  const column = typeof r.column === "number" ? r.column : Number(r.column ?? 0);
  if (!Number.isFinite(line) || line < 1) {
    return undefined;
  }
  return { line, column: Number.isFinite(column) ? column : 0 };
}

function extractRuleId(raw: Record<string, unknown>): string {
  const v =
    raw.ruleId ??
    raw.rule_id ??
    raw.id ??
    (raw.rule as Record<string, unknown> | undefined)?.id ??
    "unknown";
  return String(v);
}

function extractPath(raw: Record<string, unknown>, repoRoot: string): string {
  const p = raw.path ?? raw.file ?? raw.filename ?? "";
  const s = String(p);
  if (!s) {
    return "";
  }
  return toRepoRelativePosix(s, repoRoot);
}

function extractLanguage(raw: Record<string, unknown>): string {
  const l = raw.language ?? raw.lang ?? "";
  return String(l || "unknown");
}

function extractRange(
  raw: Record<string, unknown>,
): { start?: Position; end?: Position } {
  const range = raw.range;
  if (range && typeof range === "object") {
    const r = range as Record<string, unknown>;
    const start = readPos(r, "start") ?? readPos(raw, "start");
    const end = readPos(r, "end") ?? readPos(raw, "end");
    return { start, end };
  }
  return {
    start: readPos(raw, "start"),
    end: readPos(raw, "end"),
  };
}

/** Map one ast-grep JSON object to NormalizedMatch. */
export function mapRawMatch(raw: unknown, repoRoot: string): NormalizedMatch | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const rel = extractPath(o, repoRoot);
  if (!rel) {
    return null;
  }
  const { start, end } = extractRange(o);
  const rule_id = extractRuleId(o);
  const text = o.text != null ? String(o.text) : "";
  const message = o.message != null ? String(o.message) : text.slice(0, 200);
  const sev = o.severity;
  const severity =
    sev === "error" || sev === "warning" || sev === "info" ? sev : "info";
  const meta: Record<string, unknown> = {};
  if (o.note) {
    meta.note = o.note;
  }
  if (o.labels) {
    meta.labels = o.labels;
  }
  return {
    rule_id,
    severity,
    language: extractLanguage(o),
    path: rel,
    start,
    end,
    message,
    meta,
  };
}

export function stableSortMatches(matches: NormalizedMatch[]): NormalizedMatch[] {
  return [...matches].sort((a, b) => {
    const pa = a.path.localeCompare(b.path);
    if (pa !== 0) {
      return pa;
    }
    const la = a.start?.line ?? 0;
    const lb = b.start?.line ?? 0;
    if (la !== lb) {
      return la - lb;
    }
    const ca = a.start?.column ?? 0;
    const cb = b.start?.column ?? 0;
    if (ca !== cb) {
      return ca - cb;
    }
    return a.rule_id.localeCompare(b.rule_id);
  });
}

/** Simple glob: * single segment, ** across segments. */
export function matchGlob(relPath: string, pattern: string): boolean {
  const r = relPath.replace(/\\/g, "/");
  const f = pattern.replace(/\\/g, "/");
  if (!f.includes("*") && !f.includes("?")) {
    return r === f || r.endsWith("/" + f);
  }
  const esc = f
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/<<<GLOBSTAR>>>/g, ".*");
  try {
    return new RegExp(`^${esc}$`).test(r);
  } catch {
    return false;
  }
}

export function pathMatchesGlobs(relPath: string, include: string[], exclude: string[]): boolean {
  const r = relPath.replace(/\\/g, "/");
  const inc = include.length === 0 ? ["**/*"] : include;
  if (!inc.some((g) => matchGlob(r, g))) {
    return false;
  }
  if (exclude.some((g) => matchGlob(r, g))) {
    return false;
  }
  return true;
}

export type CapResult = {
  matches: NormalizedMatch[];
  warnings: Array<{ code: string; message: string; detail?: string }>;
  truncated: boolean;
};

export function applyCaps(
  matches: NormalizedMatch[],
  maxPerFile: number,
  maxPerRule: number,
): CapResult {
  const warnings: CapResult["warnings"] = [];
  if (maxPerFile <= 0 && maxPerRule <= 0) {
    return { matches, warnings, truncated: false };
  }
  const byFile = new Map<string, number>();
  const byRule = new Map<string, number>();
  const out: NormalizedMatch[] = [];
  let truncated = false;
  for (const m of matches) {
    const fc = (byFile.get(m.path) ?? 0) + 1;
    const rc = (byRule.get(m.rule_id) ?? 0) + 1;
    if (maxPerFile > 0 && fc > maxPerFile) {
      truncated = true;
      continue;
    }
    if (maxPerRule > 0 && rc > maxPerRule) {
      truncated = true;
      continue;
    }
    byFile.set(m.path, fc);
    byRule.set(m.rule_id, rc);
    out.push(m);
  }
  if (truncated) {
    warnings.push({
      code: "matches_truncated",
      message: "Match list truncated by per-file or per-rule caps",
    });
  }
  return { matches: stableSortMatches(out), warnings, truncated };
}
