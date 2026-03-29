export const apiRoot = (): string =>
  (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

export const ghHeaders = (token: string): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function githubGetJson(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, { headers: ghHeaders(token) });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function githubRequestJson(
  method: string,
  url: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: {
      ...ghHeaders(token),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function fetchUrlTextAuthenticated(url: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.raw",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.includes(0)) {
      return null;
    }
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

export async function getGitBlobText(owner: string, repo: string, blobSha: string, token: string): Promise<string | null> {
  try {
    const url = `${apiRoot()}/repos/${owner}/${repo}/git/blobs/${blobSha}`;
    const data = (await githubGetJson(url, token)) as Record<string, unknown>;
    if (data.encoding !== "base64" || typeof data.content !== "string") {
      return null;
    }
    const raw = Buffer.from(data.content, "base64");
    if (raw.includes(0)) {
      return null;
    }
    return raw.toString("utf8");
  } catch {
    return null;
  }
}

export async function postIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  token: string,
): Promise<unknown> {
  const url = `${apiRoot()}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  return githubRequestJson("POST", url, token, { body });
}

export async function listIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
): Promise<Array<{ id?: number; body?: string }>> {
  const out: Array<{ id?: number; body?: string }> = [];
  let page = 1;
  for (;;) {
    const url = `${apiRoot()}/repos/${owner}/${repo}/issues/${issueNumber}/comments?page=${page}&per_page=100`;
    const data = (await githubGetJson(url, token)) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    out.push(...(data as Array<{ id?: number; body?: string }>));
    if (data.length < 100) {
      break;
    }
    page += 1;
  }
  return out;
}

export async function updateIssueComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string,
  token: string,
): Promise<unknown> {
  const url = `${apiRoot()}/repos/${owner}/${repo}/issues/comments/${commentId}`;
  return githubRequestJson("PATCH", url, token, { body });
}

export async function upsertIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
  markerPrefix: string,
  body: string,
): Promise<unknown> {
  const comments = await listIssueComments(owner, repo, issueNumber, token);
  const hit = comments.find((c) => (c.body ?? "").includes(markerPrefix));
  if (hit?.id != null) {
    return updateIssueComment(owner, repo, hit.id, body, token);
  }
  return postIssueComment(owner, repo, issueNumber, body, token);
}

export async function listPullReviewComments(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string,
): Promise<Array<{ body?: string }>> {
  const out: Array<{ body?: string }> = [];
  let page = 1;
  for (;;) {
    const url = `${apiRoot()}/repos/${owner}/${repo}/pulls/${pullNumber}/comments?page=${page}&per_page=100`;
    const data = (await githubGetJson(url, token)) as unknown;
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }
    out.push(...(data as Array<{ body?: string }>));
    if (data.length < 100) {
      break;
    }
    page += 1;
  }
  return out;
}

export async function postPullReviewComment(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  commitId: string,
  path: string,
  line: number,
  side: "LEFT" | "RIGHT",
  token: string,
  opts?: { startLine?: number; startSide?: string; inReplyTo?: number },
): Promise<unknown> {
  const url = `${apiRoot()}/repos/${owner}/${repo}/pulls/${pullNumber}/comments`;
  const payload: Record<string, unknown> = {
    body,
    commit_id: commitId,
    path,
    line,
    side,
  };
  if (opts?.startLine != null && opts.startLine < line) {
    payload.start_line = opts.startLine;
    payload.start_side = opts.startSide ?? side;
  }
  if (opts?.inReplyTo != null) {
    payload.in_reply_to = opts.inReplyTo;
  }
  return githubRequestJson("POST", url, token, payload);
}

export async function createPullRequest(
  owner: string,
  repo: string,
  token: string,
  params: {
    title: string;
    head: string;
    base: string;
    body: string;
  },
): Promise<{ number: number; headSha: string }> {
  const url = `${apiRoot()}/repos/${owner}/${repo}/pulls`;
  const data = (await githubRequestJson("POST", url, token, {
    title: params.title,
    head: params.head,
    base: params.base,
    body: params.body,
  })) as Record<string, unknown>;
  const number = data.number;
  const head = data.head as Record<string, unknown> | undefined;
  const headSha = head?.sha;
  if (typeof number !== "number" || typeof headSha !== "string") {
    throw new Error("createPullRequest returned incomplete payload");
  }
  return { number, headSha };
}
