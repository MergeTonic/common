import * as fs from "node:fs";
import * as path from "node:path";

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function parseMdFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  if (!text.startsWith("---")) {
    return { meta: {}, body: text.trim() };
  }
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(text);
  if (!m) {
    return { meta: {}, body: text.trim() };
  }
  const fmRaw = m[1]!;
  const body = m[2]!.trim();
  const meta: Record<string, string> = {};
  for (const line of fmRaw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) {
      continue;
    }
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body };
}

export function applyHydrationTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : `{{${key}}}`,
  );
}

function readEmbedMap(): Record<string, string> {
  const embedPath = path.join(__dirname, "..", "..", "hydration-prompts", "embed.json");
  if (!fs.existsSync(embedPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(embedPath, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof v === "string") {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

let embedCache: Record<string, string> | undefined;

function embedBodies(): Record<string, string> {
  if (!embedCache) {
    embedCache = readEmbedMap();
  }
  return embedCache;
}

/** Concatenate multiple hydration template bodies (markdown-first composition). */
export function composeHydrationBodies(templateIds: readonly string[], joiner = "\n\n"): string {
  const parts: string[] = [];
  for (const id of templateIds) {
    const b = loadHydrationPromptBody(id);
    if (b?.trim()) {
      parts.push(b.trim());
    }
  }
  return parts.join(joiner);
}

export function loadHydrationPromptBody(templateId: string): string | undefined {
  const dir = process.env.TONIC_PROMPTS_DIR?.trim();
  if (dir) {
    const base = path.resolve(dir);
    if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
      for (const f of fs.readdirSync(base)) {
        if (!f.endsWith(".md")) {
          continue;
        }
        const fp = path.join(base, f);
        const text = fs.readFileSync(fp, "utf8");
        const { meta, body } = parseMdFrontmatter(text);
        const id = meta.id?.trim();
        if (id === templateId) {
          return body.trim();
        }
      }
    }
  }
  return embedBodies()[templateId];
}

/** @internal exported for tests */
export function resetHydrationPromptCacheForTests(): void {
  embedCache = undefined;
}
