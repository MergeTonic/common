/**
 * Split large text into multiple markdown ```text``` blocks so issue/review bodies stay under GitHub limits.
 */

const DEFAULT_MAX_CHUNK_BYTES = 55_000;

function splitUtf8Hard(s: string, maxBytes: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = i + 1;
    while (end <= s.length && Buffer.byteLength(s.slice(i, end), "utf8") <= maxBytes) {
      end += 1;
    }
    end -= 1;
    if (end <= i) {
      out.push(s.slice(i, i + 1));
      i += 1;
    } else {
      out.push(s.slice(i, end));
      i = end;
    }
  }
  return out;
}

/** Split text into chunks each under maxBytes (UTF-8), preferring line boundaries. */
export function splitTextUtf8Chunks(text: string, maxBytes: number = DEFAULT_MAX_CHUNK_BYTES): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let buf: string[] = [];
  let bytes = 0;

  const flush = () => {
    if (buf.length) {
      chunks.push(buf.join("\n"));
      buf = [];
      bytes = 0;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const withNl = i < lines.length - 1 ? `${line}\n` : line;
    const lineBytes = Buffer.byteLength(withNl, "utf8");
    if (lineBytes > maxBytes) {
      flush();
      chunks.push(...splitUtf8Hard(withNl, maxBytes));
      continue;
    }
    if (bytes + lineBytes > maxBytes && buf.length) {
      flush();
    }
    buf.push(line);
    bytes += lineBytes;
  }
  flush();
  return chunks.length ? chunks : [""];
}

export function markdownCodeFences(
  lang: string,
  title: string,
  fullText: string,
  maxChunkBytes: number = DEFAULT_MAX_CHUNK_BYTES,
): string {
  const parts = splitTextUtf8Chunks(fullText, maxChunkBytes);
  if (parts.length === 1) {
    return `${title}\n\n\`\`\`${lang}\n${parts[0]!.replace(/\n$/, "")}\n\`\`\``;
  }
  const blocks: string[] = [`${title} (${parts.length} parts):`];
  for (let i = 0; i < parts.length; i++) {
    blocks.push("", `**Part ${i + 1}/${parts.length}**`, "", "```" + lang, parts[i]!.replace(/\n$/, ""), "```");
  }
  return blocks.join("\n");
}

export function markdownTextFences(
  title: string,
  fullText: string,
  maxChunkBytes: number = DEFAULT_MAX_CHUNK_BYTES,
): string {
  return markdownCodeFences("text", title, fullText, maxChunkBytes);
}

export type ContinuityHints = {
  markerBranch?: string;
  mergeReportArtifact?: string;
};

export function continuityFooter(hints?: ContinuityHints | null): string {
  if (!hints?.markerBranch && !hints?.mergeReportArtifact) {
    return "";
  }
  const bits: string[] = [];
  if (hints.mergeReportArtifact) {
    bits.push(`workflow artifact **${hints.mergeReportArtifact}**`);
  }
  if (hints.markerBranch) {
    bits.push(`branch \`${hints.markerBranch}\` (same repo paths)`);
  }
  return `\n\n_Full Tonic marker files: ${bits.join(" · ")}._`;
}
