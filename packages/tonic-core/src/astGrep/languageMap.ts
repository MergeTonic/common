/** Extension (no dot) -> ast-grep language id. */
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyi: "python",
  yml: "yaml",
  yaml: "yaml",
  json: "json",
  toml: "toml",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  csx: "csharp",
};

export function extensionToLanguage(ext: string): string | null {
  const e = ext.replace(/^\./, "").toLowerCase();
  return EXT_TO_LANG[e] ?? null;
}

/** Parse `auto` or comma-separated list of ast-grep language ids. */
export function parseLanguagesParam(raw: string): "auto" | string[] {
  const s = raw.trim().toLowerCase();
  if (!s || s === "auto") {
    return "auto";
  }
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

/** If languages is a list, file must map to one of them when auto-resolved. */
export function fileMatchesLanguageFilter(
  relPath: string,
  languages: "auto" | string[],
): { ok: boolean; language: string | null } {
  const base = relPath.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1) : "";
  const lang = extensionToLanguage(ext);
  if (languages === "auto") {
    return { ok: lang != null, language: lang };
  }
  if (!lang) {
    return { ok: false, language: null };
  }
  return { ok: languages.includes(lang), language: lang };
}
