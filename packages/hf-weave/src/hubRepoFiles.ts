import { requireHubWriteTokenUnlessOffline } from "./hubAuth";
import { hubWeaveOffline } from "./hubOffline";

function accessToken(): string {
  return (process.env.HF_TOKEN ?? "").trim();
}

/**
 * Download a file from a Hub model repo by path (e.g. CTRD or weave index).
 * Returns null if offline, missing token, missing file, or Hub module unavailable.
 */
export async function hubDownloadRepoPath(params: {
  repoId: string;
  pathInRepo: string;
}): Promise<Uint8Array | null> {
  if (hubWeaveOffline()) {
    return null;
  }
  const token = accessToken();
  if (!token) {
    return null;
  }
  try {
    const { downloadFile } = await import("@huggingface/hub");
    const res = await downloadFile({
      repo: { type: "model", name: params.repoId.trim() },
      path: params.pathInRepo,
      accessToken: token,
    });
    if (!res) {
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function hubUploadBytes(params: {
  repoId: string;
  pathInRepo: string;
  data: Uint8Array;
  commitMessage: string;
}): Promise<void> {
  if (hubWeaveOffline()) {
    return;
  }
  requireHubWriteTokenUnlessOffline();
  const token = accessToken();
  const { uploadFile } = await import("@huggingface/hub");
  await uploadFile({
    repo: { type: "model", name: params.repoId.trim() },
    file: {
      path: params.pathInRepo,
      content: new Blob([params.data]),
    },
    accessToken: token,
    commitTitle: params.commitMessage,
  });
}
