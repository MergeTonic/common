import { apiRoot, githubGetJson, githubRequestJson } from "./githubApi";

export type MarkerBranchResult = {
  branch: string;
  commitSha: string;
  paths: string[];
};

function sanitizeBranchSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

/**
 * Create or update a branch from `headSha` where listed paths contain Tonic `annotated` file text.
 */
export async function pushTonicMarkerBranch(
  owner: string,
  repo: string,
  headSha: string,
  prNumber: number,
  runId: string,
  token: string,
  pathToAnnotatedText: Record<string, string>,
): Promise<MarkerBranchResult | null> {
  const paths = Object.keys(pathToAnnotatedText).sort();
  if (!paths.length) {
    return null;
  }

  const api = apiRoot();
  const short = headSha.slice(0, 7);
  const branch = `tonic/pr-${prNumber}-${short}-${sanitizeBranchSegment(runId)}`;

  const commitUrl = `${api}/repos/${owner}/${repo}/commits/${headSha}`;
  const commitData = (await githubGetJson(commitUrl, token)) as Record<string, unknown>;
  const commitObj = commitData.commit as Record<string, unknown> | undefined;
  const tree = commitObj?.tree as Record<string, unknown> | undefined;
  const baseTreeSha = typeof tree?.sha === "string" ? tree.sha : null;
  if (!baseTreeSha) {
    throw new Error("Tonic marker branch: could not read base tree from head commit");
  }

  const treeEntries = paths.map((path) => ({
    path,
    mode: "100644" as const,
    type: "blob" as const,
    content: pathToAnnotatedText[path]!,
  }));

  const newTree = (await githubRequestJson(
    "POST",
    `${api}/repos/${owner}/${repo}/git/trees`,
    token,
    {
      base_tree: baseTreeSha,
      tree: treeEntries,
    },
  )) as Record<string, unknown>;
  const newTreeSha = newTree.sha;
  if (typeof newTreeSha !== "string") {
    throw new Error("Tonic marker branch: git/trees response missing sha");
  }

  const newCommit = (await githubRequestJson(
    "POST",
    `${api}/repos/${owner}/${repo}/git/commits`,
    token,
    {
      message: `tonic: marker snapshot for PR #${prNumber}`,
      tree: newTreeSha,
      parents: [headSha],
    },
  )) as Record<string, unknown>;
  const commitSha = newCommit.sha;
  if (typeof commitSha !== "string") {
    throw new Error("Tonic marker branch: git/commits response missing sha");
  }

  const refUrl = `${api}/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`;

  try {
    await githubRequestJson("POST", `${api}/repos/${owner}/${repo}/git/refs`, token, {
      ref: `refs/heads/${branch}`,
      sha: commitSha,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("422") || msg.includes("already exists")) {
      await githubRequestJson("PATCH", refUrl, token, {
        sha: commitSha,
        force: true,
      });
    } else {
      throw e;
    }
  }

  return { branch, commitSha, paths };
}
