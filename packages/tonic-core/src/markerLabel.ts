export type ConflictLabelMetadata = {
  raw: string;
  baseKind: string;
  tags: Record<string, string>;
};

function cleanToken(token: string): string {
  return token.trim();
}

export function parseConflictLabel(rawLabel: string): ConflictLabelMetadata {
  const raw = rawLabel.trim();
  if (!raw) {
    return { raw: "", baseKind: "", tags: {} };
  }
  const parts = raw.split("|").map(cleanToken).filter(Boolean);
  if (parts.length === 0) {
    return { raw, baseKind: raw, tags: {} };
  }
  const baseKind = parts[0] ?? raw;
  const tags: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const idx = part.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) {
      continue;
    }
    tags[key] = value;
  }
  return { raw, baseKind, tags };
}

export function formatConflictLabel(baseKind: string, tags: Record<string, string> = {}): string {
  const kind = baseKind.trim();
  const entries = Object.entries(tags)
    .filter(([key]) => key.trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key.trim()}=${String(value).trim()}`);
  if (entries.length === 0) {
    return kind;
  }
  return [kind, ...entries].join(" | ");
}

export function addTagToConflictLabel(label: string, key: string, value: string): string {
  const parsed = parseConflictLabel(label);
  parsed.tags[key] = value;
  return formatConflictLabel(parsed.baseKind, parsed.tags);
}

export function updateTagInConflictLabel(label: string, key: string, value: string): string {
  return addTagToConflictLabel(label, key, value);
}

export function removeTagFromConflictLabel(label: string, key: string): string {
  const parsed = parseConflictLabel(label);
  delete parsed.tags[key];
  return formatConflictLabel(parsed.baseKind, parsed.tags);
}

export function normalizeConflictLabel(label: string): string {
  const parsed = parseConflictLabel(label);
  return formatConflictLabel(parsed.baseKind, parsed.tags);
}

/** Normalize author (or similar) tag values for safe use inside Tonic marker labels. */
export function sanitizeAuthorTagToken(raw: string): string {
  let s = raw.trim().replace(/\s+/g, "_");
  s = s.replace(/[|<>]/g, "");
  if (s.length > 120) {
    s = s.slice(0, 120);
  }
  return s || "unknown";
}
