const apiRoot = (): string =>
  (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");

function ghHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function parseKv(argv: string[]): { flags: Set<string>; kv: Map<string, string> } {
  const flags = new Set<string>();
  const kv = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      continue;
    }
    const key = a.slice(2).replace(/-/g, "_");
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      kv.set(key, next);
      i++;
    } else {
      flags.add(key);
    }
  }
  return { flags, kv };
}

export async function githubMainAsync(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (sub !== "ref") {
    console.error("Usage: merge-tonic github ref create --repo owner/name --ref refs/heads/branch --sha <sha>");
    return 1;
  }
  const sub2 = rest[0];
  const tail = rest.slice(1);
  if (sub2 !== "create") {
    console.error("Only: merge-tonic github ref create ...");
    return 1;
  }
  const { kv } = parseKv(tail);
  const repo = kv.get("repo") ?? process.env.GITHUB_REPOSITORY ?? "";
  const ref = kv.get("ref") ?? "";
  const sha = kv.get("sha") ?? "";
  const token = process.env.GITHUB_TOKEN ?? "";
  if (!repo || !ref || !sha || !token) {
    console.error("Need --repo owner/name (or GITHUB_REPOSITORY), --ref, --sha, GITHUB_TOKEN");
    return 1;
  }
  const [owner, name] = repo.split("/", 2);
  if (!owner || !name) {
    console.error("Invalid --repo, expected owner/name");
    return 1;
  }
  const url = `${apiRoot()}/repos/${owner}/${name}/git/refs`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...ghHeaders(token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref, sha }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`GitHub API ${res.status}: ${text}`);
    return 1;
  }
  console.log(text);
  return 0;
}
