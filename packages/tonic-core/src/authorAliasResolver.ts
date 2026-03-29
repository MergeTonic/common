import { gitExec } from "./gitExec";
import { sanitizeAuthorTagToken } from "./markerLabel";

export type AuthorMode = "base-head" | "human" | "ref";

export type GitExecResult = { code: number | null; stdout: string; stderr: string };

export type GitAuthorProbe = (repoRoot: string, ref: string) => GitExecResult;

export type ResolveAuthorAliasParams = {
  repoRoot: string;
  mode: AuthorMode;
  /** Left side ref or sha (e.g. base branch name). */
  leftRef: string;
  /** Right side ref or sha (e.g. head branch name). */
  rightRef: string;
  /** Optional explicit overrides (highest precedence). */
  explicitLeft?: string;
  explicitRight?: string;
  /** Optional GitHub login when available (e.g. from API). */
  githubLoginLeft?: string;
  githubLoginRight?: string;
  /** Probe git for `%an` / `%ae` (two lines: name then email). */
  gitProbe?: GitAuthorProbe;
};

const DEFAULT_LEFT = "base";
const DEFAULT_RIGHT = "head";

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  const local = at >= 0 ? email.slice(0, at) : email;
  return sanitizeAuthorTagToken(local);
}

/**
 * Parse `git show -s --format=%an%n%ae` style output (name line, email line).
 */
export function parseGitAuthorNameEmail(stdout: string): { name: string; email: string } {
  const lines = stdout.split(/\r?\n/).filter((l) => l.length > 0);
  const name = (lines[0] ?? "").trim();
  const email = (lines[1] ?? "").trim();
  return { name, email };
}

/** Deterministic human-readable alias from git author metadata. */
export function humanAliasFromGitStdout(stdout: string): string {
  const { name, email } = parseGitAuthorNameEmail(stdout);
  if (name) {
    return sanitizeAuthorTagToken(name);
  }
  if (email) {
    return emailLocalPart(email);
  }
  return DEFAULT_LEFT;
}

/**
 * Resolve display author tag for one side.
 */
export function resolveAuthorAliasForSide(
  side: "left" | "right",
  p: ResolveAuthorAliasParams,
): string {
  const explicit = side === "left" ? p.explicitLeft : p.explicitRight;
  if (explicit?.trim()) {
    return sanitizeAuthorTagToken(explicit);
  }
  const gh = side === "left" ? p.githubLoginLeft : p.githubLoginRight;
  if (gh?.trim()) {
    return sanitizeAuthorTagToken(gh);
  }
  const ref = side === "left" ? p.leftRef : p.rightRef;
  if (p.mode === "ref" && ref.trim()) {
    return sanitizeAuthorTagToken(ref.replace(/^refs\/heads\//, ""));
  }
  if (p.mode === "human" && p.gitProbe && ref.trim()) {
    const { stdout, code } = p.gitProbe(p.repoRoot, ref);
    if (code === 0 && stdout.trim()) {
      return humanAliasFromGitStdout(stdout);
    }
  }
  return side === "left" ? DEFAULT_LEFT : DEFAULT_RIGHT;
}

/** Default probe: `git show -s --format=%an%n%ae <ref>` in the bound repo root. */
export function createDefaultGitAuthorProbe(repoRoot: string): GitAuthorProbe {
  return (_root: string, ref: string) => gitExec(repoRoot, ["show", "-s", "--format=%an%n%ae", ref]);
}
