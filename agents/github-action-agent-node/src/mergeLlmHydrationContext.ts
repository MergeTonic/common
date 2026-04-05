import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

/** Subset of merge-report `ast_hydration` used when building merge LLM context. */
export type AstHydrationReportSlice = {
  mode?: string;
  hydration_run_path?: string;
  intent_hydration_path?: string;
  ast_evidence_path?: string;
  retrieval_path?: string | null;
  code_walk_trace_path?: string | null;
  prompt_excerpt?: string;
};

function normRel(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveUnderRepo(repoRoot: string, p: string | null | undefined): string | null {
  if (typeof p !== "string" || !p.trim()) {
    return null;
  }
  const s = p.trim();
  return path.isAbsolute(s) ? s : path.join(repoRoot, s);
}

function readJson(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n… [truncated ${s.length - max} characters]`;
}

/**
 * Builds a markdown appendix for the conflict-resolution LLM from hydrate pipeline artifacts.
 * Empty when hydration was skipped or files are missing.
 */
export function buildMergeLlmHydrationAppendix(
  repoRoot: string,
  astPayload: AstHydrationReportSlice | null | undefined,
  conflictRelPath: string,
  maxChars = 14000,
): string {
  if (!astPayload || astPayload.mode === "skipped") {
    return "";
  }

  const root = path.resolve(repoRoot);
  const rel = normRel(conflictRelPath);
  const runPath = resolveUnderRepo(root, astPayload.hydration_run_path);
  let intentPath = resolveUnderRepo(root, astPayload.intent_hydration_path);
  let astPath = resolveUnderRepo(root, astPayload.ast_evidence_path);
  let retrievalPath = resolveUnderRepo(root, astPayload.retrieval_path ?? undefined);
  let codeWalkPath = resolveUnderRepo(root, astPayload.code_walk_trace_path ?? undefined);

  let runRecord: Record<string, unknown> | null = null;
  if (runPath && fs.existsSync(runPath)) {
    const run = asRecord(readJson(runPath));
    if (run) {
      runRecord = run;
      if (!intentPath) {
        intentPath = resolveUnderRepo(root, run.intent_hydration_path as string | undefined);
      }
      if (!astPath) {
        astPath = resolveUnderRepo(root, run.ast_evidence_path as string | undefined);
      }
      if (!retrievalPath) {
        retrievalPath = resolveUnderRepo(root, run.retrieval_path as string | undefined);
      }
      if (!codeWalkPath) {
        codeWalkPath = resolveUnderRepo(root, run.code_walk_trace_path as string | undefined);
      }
    }
  }

  const parts: string[] = [];
  let substantive = false;

  const push = (...lines: string[]) => {
    parts.push(...lines);
    substantive = true;
  };

  if (runRecord) {
    const inputs = asRecord(runRecord.inputs);
    const uq = typeof inputs?.user_query === "string" ? inputs.user_query.trim() : "";
    const fu = typeof inputs?.follow_up === "string" ? inputs.follow_up.trim() : "";
    if (uq || fu) {
      const noteLines: string[] = ["#### User notes"];
      if (uq) {
        noteLines.push(truncate(uq, 2000));
      }
      if (fu) {
        noteLines.push(truncate(fu, 2000));
      }
      noteLines.push("");
      push(...noteLines);
    }
    const summary: Record<string, unknown> = {};
    if (typeof runRecord.status === "string") {
      summary.status = runRecord.status;
    }
    if (typeof runRecord.exit_code === "number") {
      summary.exit_code = runRecord.exit_code;
    }
    const pipe = asRecord(runRecord.pipeline);
    const stages = pipe?.stages;
    if (Array.isArray(stages)) {
      summary.stages = stages
        .map((s) => {
          const o = asRecord(s);
          return typeof o?.id === "string" ? o.id : null;
        })
        .filter((x): x is string => x != null);
    }
    if (Object.keys(summary).length > 0) {
      push("#### Run summary", truncate(JSON.stringify(summary), 4000), "");
    }
  }

  if (typeof astPayload.prompt_excerpt === "string" && astPayload.prompt_excerpt.trim()) {
    push("#### Intent bundle excerpt", truncate(astPayload.prompt_excerpt.trim(), 6000), "");
  }

  if (intentPath && fs.existsSync(intentPath)) {
    const intent = asRecord(readJson(intentPath));
    if (intent) {
      const left = typeof intent.left_intent === "string" ? intent.left_intent : "";
      const right = typeof intent.right_intent === "string" ? intent.right_intent : "";
      push("#### Recorded intents", `Left: ${left}`, `Right: ${right}`, "");
      const links = intent.evidence_links;
      if (Array.isArray(links)) {
        const forFile = links.filter((x) => {
          const o = asRecord(x);
          const p = typeof o?.path === "string" ? normRel(o.path) : "";
          return p === rel || p.endsWith(`/${rel}`) || rel.endsWith(p);
        });
        if (forFile.length) {
          push(
            `#### Evidence links (${rel})`,
            truncate(JSON.stringify(forFile, null, 2), 4000),
            "",
          );
        }
      }
    }
  }

  if (astPath && fs.existsSync(astPath)) {
    const ast = asRecord(readJson(astPath));
    const matches = ast?.matches;
    if (Array.isArray(matches)) {
      const forFile = matches.filter((m) => {
        const o = asRecord(m);
        const p = typeof o?.path === "string" ? normRel(o.path) : "";
        return p === rel;
      });
      const slice = forFile.slice(0, 24);
      if (slice.length) {
        push(
          `#### AST-grep matches (${rel}, top ${slice.length})`,
          truncate(JSON.stringify(slice, null, 2), 5000),
          "",
        );
      }
    }
  }

  if (retrievalPath && fs.existsSync(retrievalPath)) {
    const ret = asRecord(readJson(retrievalPath));
    const hits = ret?.hits;
    if (Array.isArray(hits)) {
      const forFile = hits.filter((h) => {
        const o = asRecord(h);
        const meta = asRecord(o?.metadata);
        const p = typeof meta?.path === "string" ? normRel(meta.path as string) : "";
        return p === rel;
      });
      const slice = forFile.slice(0, 12);
      if (slice.length) {
        push(
          `#### Retrieval hits (${rel}, top ${slice.length})`,
          truncate(JSON.stringify(slice, null, 2), 5000),
          "",
        );
      }
    }
  }

  if (codeWalkPath && fs.existsSync(codeWalkPath)) {
    const cw = asRecord(readJson(codeWalkPath));
    if (cw) {
      push("#### Code-walk trace (excerpt)", truncate(JSON.stringify(cw, null, 2), 4000), "");
    }
  }

  if (!substantive) {
    return "";
  }

  const body = [
    "### Hydration pipeline context",
    "Use this to align with recorded merge intents and structural/retrieval evidence. Do not paste artifact JSON verbatim into the resolved file.",
    "",
    ...parts,
  ]
    .join("\n")
    .trim();
  return truncate(body, maxChars);
}

export function hydrationContextDigest(appendix: string): string {
  return crypto.createHash("sha256").update(appendix, "utf8").digest("hex").slice(0, 32);
}
