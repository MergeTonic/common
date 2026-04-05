import { createHash } from "node:crypto";

export function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Line split after LF normalization; trailing empty line from final `\n` is dropped (parity with Python `canonical_text_lines`). */
export function canonicalTextLines(text: string): string[] {
  const norm = normalizeLf(text);
  const lines = norm.length ? norm.split("\n") : [];
  if (lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

export function sha256HexUtf8(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256HexBytes(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
