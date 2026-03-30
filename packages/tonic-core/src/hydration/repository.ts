import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type HydrationRepositoryFile = {
  relativePath: string;
  absolutePath: string;
  content: string;
  contentHash: string;
  sizeBytes: number;
};

export type HydrationRepositoryOptions = {
  denyPathPrefixes?: string[];
  maxFileBytes?: number;
  scopePatterns?: string[];
  includePaths?: string[];
};

const DEFAULT_DENY_PATH_PREFIXES = [
  ".git/",
  ".tonic/",
  "node_modules/",
  "__pycache__/",
];

const SECRET_FILE_PATTERN =
  /(^|\/)(\.env($|\.)|id_rsa($|\.)|id_ed25519($|\.)|.*\.(pem|key|p12|pfx|crt|der|cer))$/i;
const GIT_METADATA_FILE_PATTERN = /(^|\/)\.(gitignore|gitattributes|gitmodules)$/i;

function normalizeRelativePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

function splitZeroTerminatedBuffer(buffer: Buffer): string[] {
  return buffer
    .toString("utf8")
    .split("\u0000")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function looksLikeText(buffer: Buffer): boolean {
  for (const byte of buffer.values()) {
    if (byte === 0) {
      return false;
    }
  }
  return true;
}

function shouldIgnorePath(relativePath: string, denyPathPrefixes: string[]): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || SECRET_FILE_PATTERN.test(normalized) || GIT_METADATA_FILE_PATTERN.test(normalized)) {
    return true;
  }
  return denyPathPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`(^|/)${escaped}$`);
}

function matchesGitignore(relativePath: string, gitignoreText: string | null): boolean {
  if (!gitignoreText) {
    return false;
  }
  const normalized = normalizeRelativePath(relativePath);
  let ignored = false;
  for (const line of gitignoreText.split(/\r?\n/).map((entry) => entry.trim())) {
    if (!line || line.startsWith("#")) {
      continue;
    }
    const negated = line.startsWith("!");
    const raw = (negated ? line.slice(1) : line).trim().replace(/^\/+/, "");
    if (!raw) {
      continue;
    }
    if (wildcardToRegex(raw).test(normalized)) {
      ignored = !negated;
    }
  }
  return ignored;
}

function matchesScope(relativePath: string, scopePatterns: string[]): boolean {
  if (scopePatterns.length === 0) {
    return true;
  }
  const normalized = normalizeRelativePath(relativePath);
  return scopePatterns.some((pattern) => wildcardToRegex(normalizeRelativePath(pattern)).test(normalized));
}

function loadGitignoreText(repoRoot: string): string | null {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return null;
  }
  try {
    return fs.readFileSync(gitignorePath, "utf8");
  } catch {
    return null;
  }
}

function walkFallback(repoRoot: string, denyPathPrefixes: string[], gitignoreText: string | null): string[] {
  const out: string[] = [];
  const stack = [repoRoot];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath));
      if (
        shouldIgnorePath(relativePath, denyPathPrefixes)
        || matchesGitignore(relativePath, gitignoreText)
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        out.push(relativePath);
      }
    }
  }
  return out.sort();
}

export class HydrationRepository {
  readonly repoRoot: string;
  readonly denyPathPrefixes: string[];
  readonly maxFileBytes: number;
  readonly scopePatterns: string[];
  readonly includePaths: string[];

  constructor(repoRoot: string, options: HydrationRepositoryOptions = {}) {
    this.repoRoot = path.resolve(repoRoot);
    this.denyPathPrefixes = [
      ...DEFAULT_DENY_PATH_PREFIXES,
      ...(options.denyPathPrefixes ?? []).map((entry) => normalizeRelativePath(entry)),
    ];
    this.maxFileBytes = options.maxFileBytes ?? 512 * 1024;
    this.scopePatterns = (options.scopePatterns ?? [])
      .map((entry) => normalizeRelativePath(entry))
      .filter(Boolean);
    this.includePaths = (options.includePaths ?? [])
      .map((entry) => normalizeRelativePath(entry))
      .filter(Boolean);
  }

  listIndexablePaths(): string[] {
    const gitignoreText = loadGitignoreText(this.repoRoot);
    try {
      const output = execFileSync(
        "git",
        ["-C", this.repoRoot, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        {
          encoding: "buffer",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      const discovered = splitZeroTerminatedBuffer(output as Buffer)
        .map((entry) => normalizeRelativePath(entry))
        .filter((entry) => !shouldIgnorePath(entry, this.denyPathPrefixes))
        .filter((entry) => !matchesGitignore(entry, gitignoreText))
        .filter((entry) => matchesScope(entry, this.scopePatterns))
        .filter((entry) => {
          const absolutePath = path.join(this.repoRoot, entry);
          return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
        });
      for (const includePath of this.includePaths) {
        const absolutePath = path.join(this.repoRoot, includePath);
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
          continue;
        }
        if (shouldIgnorePath(includePath, this.denyPathPrefixes) || matchesGitignore(includePath, gitignoreText)) {
          continue;
        }
        discovered.push(includePath);
      }
      return [...new Set(discovered)].sort();
    } catch {
      const discovered = walkFallback(this.repoRoot, this.denyPathPrefixes, gitignoreText)
        .filter((entry) => matchesScope(entry, this.scopePatterns));
      for (const includePath of this.includePaths) {
        const absolutePath = path.join(this.repoRoot, includePath);
        if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
          continue;
        }
        if (shouldIgnorePath(includePath, this.denyPathPrefixes) || matchesGitignore(includePath, gitignoreText)) {
          continue;
        }
        discovered.push(includePath);
      }
      return [...new Set(discovered)].sort();
    }
  }

  readIndexableFiles(): HydrationRepositoryFile[] {
    const files: HydrationRepositoryFile[] = [];
    for (const relativePath of this.listIndexablePaths()) {
      const absolutePath = path.join(this.repoRoot, relativePath);
      const buffer = fs.readFileSync(absolutePath);
      if (buffer.byteLength > this.maxFileBytes || !looksLikeText(buffer)) {
        continue;
      }
      const content = buffer.toString("utf8");
      files.push({
        relativePath,
        absolutePath,
        content,
        contentHash: hashContent(content),
        sizeBytes: buffer.byteLength,
      });
    }
    return files;
  }
}
