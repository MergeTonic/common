import * as fs from "node:fs";
import * as path from "node:path";

import type { AstHydrationArtifactV1, NormalizedMatch } from "../astGrep/types";
import type { ConflictContextArtifactV1 } from "./conflictScan";
import type { IntentBootstrapArtifactV1 } from "./intentBootstrap";
import type { QuestionRefinementArtifactV1 } from "./questionRefinement";

export type RetrievalHitBrief = {
  chunk_id: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type IntentHydrationArtifactV1 = {
  schema: "tonic-intent-hydration";
  version: "1";
  left_intent: string;
  right_intent: string;
  truncation_policy_version?: string;
  token_budget_hint?: number;
  conflict_region_ids?: string[];
  evidence_links: Array<{
    id?: string;
    type: "ast_match" | "retrieval_hit" | "code_walk" | "conflict";
    path: string;
    line_start?: number;
    line_end?: number;
    detail?: string;
  }>;
  prompt_excerpt?: string;
};

function pickIntents(
  boot: IntentBootstrapArtifactV1,
  refine: QuestionRefinementArtifactV1 | null,
): { left: string; right: string } {
  if (
    refine &&
    refine.mode !== "off" &&
    refine.refined_left_intent &&
    refine.refined_right_intent
  ) {
    return { left: refine.refined_left_intent, right: refine.refined_right_intent };
  }
  if (refine?.refined_left_intent && refine.refined_right_intent) {
    return { left: refine.refined_left_intent, right: refine.refined_right_intent };
  }
  return { left: boot.left_intent, right: boot.right_intent };
}

function astMatchesNearConflicts(
  ast: AstHydrationArtifactV1 | null,
  conflicts: ConflictContextArtifactV1,
  maxPerFile: number,
): NormalizedMatch[] {
  if (!ast || ast.matches.length === 0 || conflicts.conflict_regions.length === 0) {
    return ast?.matches.slice(0, 50) ?? [];
  }
  const byFile = new Map<string, ConflictContextArtifactV1["conflict_regions"]>();
  for (const r of conflicts.conflict_regions) {
    const list = byFile.get(r.path) ?? [];
    list.push(r);
    byFile.set(r.path, list);
  }
  const scored: Array<{ m: NormalizedMatch; score: number }> = [];
  for (const m of ast.matches) {
    const regs = byFile.get(m.path);
    if (!regs) {
      continue;
    }
    const line = m.start?.line ?? 0;
    let best = Infinity;
    for (const reg of regs) {
      const d = Math.abs(line - reg.mid_line);
      if (d < best) {
        best = d;
      }
    }
    scored.push({ m, score: best });
  }
  scored.sort((a, b) =>
    a.score !== b.score
      ? a.score - b.score
      : a.m.path !== b.m.path
        ? a.m.path.localeCompare(b.m.path)
        : (a.m.rule_id || "").localeCompare(b.m.rule_id || ""),
  );
  const out: NormalizedMatch[] = [];
  const perFile = new Map<string, number>();
  for (const { m } of scored) {
    const n = (perFile.get(m.path) ?? 0) + 1;
    if (n > maxPerFile) {
      continue;
    }
    perFile.set(m.path, n);
    out.push(m);
    if (out.length >= 80) {
      break;
    }
  }
  if (out.length === 0) {
    return ast.matches.slice(0, 50);
  }
  return out;
}

export function buildIntentHydration(params: {
  bootstrap: IntentBootstrapArtifactV1;
  refinement: QuestionRefinementArtifactV1 | null;
  conflicts: ConflictContextArtifactV1 | null;
  ast: AstHydrationArtifactV1 | null;
  astPath?: string;
  conflictPath?: string;
  retrieval?: { artifactPath: string; hits: RetrievalHitBrief[] };
  codeWalkTracePath?: string;
}): IntentHydrationArtifactV1 {
  const { left, right } = pickIntents(params.bootstrap, params.refinement);
  const links: IntentHydrationArtifactV1["evidence_links"] = [];
  const regionIds: string[] = [];

  if (params.conflicts) {
    for (const r of params.conflicts.conflict_regions) {
      if (r.region_id) {
        regionIds.push(r.region_id);
      }
      links.push({
        id: r.region_id,
        type: "conflict",
        path: r.path,
        line_start: r.start_line,
        line_end: r.end_line,
        detail: "git conflict marker region",
      });
    }
  }

  const emptyConflicts: ConflictContextArtifactV1 = {
    schema: "tonic-conflict-context",
    version: "1",
    scan_scope: "none",
    conflict_regions: [],
  };
  const near = astMatchesNearConflicts(params.ast, params.conflicts ?? emptyConflicts, 5);
  let i = 0;
  for (const m of near) {
    i += 1;
    links.push({
      id: `ast-${i}`,
      type: "ast_match",
      path: m.path,
      line_start: m.start?.line,
      line_end: m.end?.line,
      detail: m.rule_id,
    });
  }

  const maxRetrievalLinks = 25;
  if (params.retrieval?.hits?.length) {
    for (let j = 0; j < Math.min(params.retrieval.hits.length, maxRetrievalLinks); j++) {
      const h = params.retrieval.hits[j]!;
      const p = String(h.metadata?.path ?? "");
      const meta = h.metadata ?? {};
      const boost = meta.ast_boost_applied === true ? " ast_boost_applied=true" : "";
      const near = typeof meta.nearest_conflict_region_id === "string" ? meta.nearest_conflict_region_id : "";
      const nearPart = near ? ` nearest_conflict_region_id=${near}` : "";
      links.push({
        id: `retrieval-${h.chunk_id}`,
        type: "retrieval_hit",
        path: p,
        line_start: typeof h.metadata?.start_line === "number" ? h.metadata.start_line : undefined,
        line_end: typeof h.metadata?.end_line === "number" ? h.metadata.end_line : undefined,
        detail: `score=${typeof h.score === "number" ? h.score.toFixed(4) : "?"}${boost}${nearPart}`,
      });
    }
  }

  if (params.codeWalkTracePath) {
    links.push({
      id: "code-walk-trace",
      type: "code_walk",
      path: params.codeWalkTracePath.replace(/\\/g, "/"),
      detail: "tonic-code-walk-trace.v1",
    });
  }

  const excerpt =
    `Intents — left: ${left}\n` +
    `Intents — right: ${right}\n` +
    (params.refinement?.subquestions?.length
      ? `Subquestions: ${params.refinement.subquestions.map((s) => s.text).join(" | ")}\n`
      : "") +
    `Evidence links: ${links.length}`;

  links.sort((a, b) => {
    const ta = a.type.localeCompare(b.type);
    if (ta !== 0) {
      return ta;
    }
    const pa = a.path.localeCompare(b.path);
    if (pa !== 0) {
      return pa;
    }
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

  return {
    schema: "tonic-intent-hydration",
    version: "1",
    left_intent: left,
    right_intent: right,
    truncation_policy_version: "1",
    token_budget_hint: 8000,
    conflict_region_ids: regionIds.length ? regionIds : undefined,
    evidence_links: links,
    prompt_excerpt: excerpt,
  };
}

export function readJsonFile<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeIntentHydration(pathOut: string, art: IntentHydrationArtifactV1): void {
  fs.mkdirSync(path.dirname(path.resolve(pathOut)), { recursive: true });
  fs.writeFileSync(pathOut, JSON.stringify(art, null, 2) + "\n", "utf8");
}
