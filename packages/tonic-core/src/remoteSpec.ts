import * as fs from "node:fs";
import * as path from "node:path";

export type ResolvedLocalPath = { kind: "path"; path: string; cleanup?: () => void };

export type ResolvedGitHubSpec = {
  kind: "github";
  url: string;
  /** When set, caller should run git clone into this directory and remove on exit. */
  suggestedCloneDir?: string;
};

export type ResolvedHubSpec = { kind: "hub"; repoId: string };

export type RemoteSpecResolution = ResolvedLocalPath | ResolvedGitHubSpec | ResolvedHubSpec;

const HF_HOST = /^(?:https?:\/\/)?(?:www\.)?huggingface\.co\//i;
const GH_HTTPS = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;
const GH_SSH = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i;

/** Normalize org/model from huggingface.co URL or bare org/model. */
export function resolveHubRepoSpec(input: string): ResolvedHubSpec | null {
  const s = input.trim();
  if (!s) {
    return null;
  }
  if (HF_HOST.test(s)) {
    const rest = s.replace(HF_HOST, "").replace(/\/$/, "");
    const repoId = rest.split("/").filter(Boolean).slice(0, 2).join("/");
    if (repoId.includes("/")) {
      return { kind: "hub", repoId };
    }
    return null;
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(s) && !s.includes("://") && !s.includes("@")) {
    return { kind: "hub", repoId: s };
  }
  return null;
}

/** Recognize GitHub https or ssh URL (does not clone). */
export function resolveGitHubRemoteSpec(input: string): ResolvedGitHubSpec | null {
  const s = input.trim();
  const m1 = s.match(GH_HTTPS);
  if (m1) {
    return { kind: "github", url: `https://github.com/${m1[1]}/${m1[2]}.git` };
  }
  const m2 = s.match(GH_SSH);
  if (m2) {
    return { kind: "github", url: `git@github.com:${m2[1]}/${m2[2]}.git` };
  }
  return null;
}

/** If `input` is an existing directory, treat as local git root. */
export function resolveLocalRepoPath(input: string): ResolvedLocalPath | null {
  const abs = path.resolve(input.trim());
  if (!input.trim()) {
    return null;
  }
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory() && fs.existsSync(path.join(abs, ".git"))) {
      return { kind: "path", path: abs };
    }
  } catch {
    /* missing */
  }
  return null;
}

/** Classify a user string: local path, GitHub URL, or Hub repo id. */
export function resolveRemoteSpec(input: string): RemoteSpecResolution | null {
  const local = resolveLocalRepoPath(input);
  if (local) {
    return local;
  }
  const gh = resolveGitHubRemoteSpec(input);
  if (gh) {
    return gh;
  }
  const hub = resolveHubRepoSpec(input);
  if (hub) {
    return hub;
  }
  return null;
}
