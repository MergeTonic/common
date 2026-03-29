import { fetchUrlTextAuthenticated, getGitBlobText, githubGetJson } from "./githubApi";
import type { GitMergeHydrationOptions } from "@mergetonic/core";
import { hydrateGitMerge, type GitHydratePair } from "./hydrateGitMerge";

const BINARY = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".bz2",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".webm",
  ".wasm",
  ".pyc",
  ".class",
  ".jar",
]);

export function isProbablyTextPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const ext of BINARY) {
    if (lower.endsWith(ext)) {
      return false;
    }
  }
  return true;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

export async function compareCommits(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  token: string,
): Promise<Record<string, unknown>> {
  const api = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
  const url = `${api}/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`;
  return (await githubGetJson(url, token)) as Record<string, unknown>;
}

export async function getContentsPayload(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const api = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
  const url = `${api}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`;
  try {
    return (await githubGetJson(url, token)) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof Error && e.message.includes("GitHub API 404")) {
      return null;
    }
    throw e;
  }
}

export function decodeFileContent(payload: Record<string, unknown>): string | null {
  const enc = payload.encoding;
  const content = payload.content;
  if (enc === "base64" && typeof content === "string") {
    const raw = Buffer.from(content, "base64");
    if (raw.includes(0)) {
      return null;
    }
    return raw.toString("utf8");
  }
  return null;
}

export async function fetchFileText(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  token: string,
  blobSha?: string | null,
): Promise<string | null> {
  const payload = await getContentsPayload(owner, repo, path, ref, token);
  if (!payload || payload.type !== "file") {
    if (blobSha) {
      return getGitBlobText(owner, repo, blobSha, token);
    }
    return null;
  }
  let text = decodeFileContent(payload);
  if (text == null && typeof payload.download_url === "string") {
    text = await fetchUrlTextAuthenticated(payload.download_url, token);
  }
  if (text == null && blobSha) {
    text = await getGitBlobText(owner, repo, blobSha, token);
  }
  return text;
}

export async function listTreeBlobShas(
  owner: string,
  repo: string,
  treeSha: string,
  token: string,
): Promise<Record<string, string>> {
  const api = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
  const url = `${api}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
  const data = (await githubGetJson(url, token)) as Record<string, unknown>;
  const out: Record<string, string> = {};
  const tree = data.tree;
  if (!Array.isArray(tree)) {
    return out;
  }
  for (const item of tree) {
    const ent = item as Record<string, unknown>;
    if (ent.type !== "blob") {
      continue;
    }
    const p = ent.path;
    const s = ent.sha;
    if (typeof p === "string" && typeof s === "string") {
      out[p] = s;
    }
  }
  return out;
}

function lines(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  const out = text.split(/\r?\n/);
  if (out.length > 0 && out[out.length - 1] === "") {
    out.pop();
  }
  return out;
}

export type HydratePair = {
  leftLines: string[];
  rightLines: string[];
  status: string;
  gitAnnotatedLines?: string[];
  mergedLines?: string[];
};

export async function hydratePrFiles(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  token: string,
  mode: string,
  maxFiles: number,
  gitMergeHydration?: GitMergeHydrationOptions,
): Promise<Record<string, HydratePair>> {
  if (mode === "git-merge") {
    const workspace = process.env.TONIC_AGENT_ISOLATED_WORKSPACE || process.env.GITHUB_WORKSPACE || process.cwd();
    return hydrateGitMerge({
      workspace,
      baseSha,
      headSha,
      maxFiles,
      gitMergeHydration,
    }) as Record<string, GitHydratePair>;
  }
  const out: Record<string, HydratePair> = {};
  if (mode === "symmetric-union") {
    const baseTree = await listTreeBlobShas(owner, repo, baseSha, token);
    const headTree = await listTreeBlobShas(owner, repo, headSha, token);
    const paths = Array.from(new Set([...Object.keys(baseTree), ...Object.keys(headTree)])).sort();
    for (const path of paths) {
      if (Object.keys(out).length >= maxFiles) {
        break;
      }
      if (!isProbablyTextPath(path)) {
        continue;
      }
      const bs = baseTree[path];
      const hs = headTree[path];
      if (bs != null && bs === hs) {
        continue;
      }
      let leftT =
        path in baseTree
          ? await fetchFileText(owner, repo, path, baseSha, token, bs ?? null)
          : null;
      let rightT =
        path in headTree
          ? await fetchFileText(owner, repo, path, headSha, token, hs ?? null)
          : null;
      if (leftT == null && bs && path in baseTree) {
        leftT = await getGitBlobText(owner, repo, bs, token);
      }
      if (rightT == null && hs && path in headTree) {
        rightT = await getGitBlobText(owner, repo, hs, token);
      }
      let st: string;
      if (path in baseTree && !(path in headTree)) {
        st = "removed";
      } else if (!(path in baseTree) && path in headTree) {
        st = "added";
      } else {
        st = "modified";
      }
      out[path] = { leftLines: lines(leftT), rightLines: lines(rightT), status: st };
    }
    return out;
  }

  const cmp = await compareCommits(owner, repo, baseSha, headSha, token);
  const files = cmp.files;
  if (!Array.isArray(files)) {
    return out;
  }
  for (const ent of files) {
    if (Object.keys(out).length >= maxFiles) {
      break;
    }
    const e = ent as Record<string, unknown>;
    const status = String(e.status ?? "");
    const filename = e.filename;
    if (typeof filename !== "string" || !isProbablyTextPath(filename)) {
      continue;
    }
    const prev = e.previous_filename;
    const prevS = typeof prev === "string" ? prev : null;
    const headBlobSha = typeof e.sha === "string" ? e.sha : null;

    let leftT: string | null;
    let rightT: string | null;
    if (status === "added") {
      leftT = null;
      rightT = await fetchFileText(owner, repo, filename, headSha, token, headBlobSha);
    } else if (status === "removed") {
      leftT = await fetchFileText(owner, repo, filename, baseSha, token);
      rightT = null;
    } else if (status === "renamed" && prevS) {
      leftT = await fetchFileText(owner, repo, prevS, baseSha, token);
      rightT = await fetchFileText(owner, repo, filename, headSha, token, headBlobSha);
    } else {
      leftT = await fetchFileText(owner, repo, filename, baseSha, token);
      rightT = await fetchFileText(owner, repo, filename, headSha, token, headBlobSha);
    }
    out[filename] = {
      leftLines: lines(leftT),
      rightLines: lines(rightT),
      status: status || "modified",
    };
  }
  return out;
}
