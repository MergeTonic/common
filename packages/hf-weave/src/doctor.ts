export function printDoctor(): void {
  console.log(
    "@mergetonic/hf-weave: Hub weave blobs (hubPushLocalWeaveBlobs), repo file I/O (hubDownloadRepoPath, hubUploadBytes), " +
      "weave index (refreshWeaveHubIndex), CTRD (publishCtRdToHub, fetchCtRdFromHub). " +
      "merge-tonic / hf-weave CLIs use these modules via dynamic import when @mergetonic/hf-weave is installed. " +
      "Set HF_TOKEN for Hub writes when not offline; HF_HUB_OFFLINE=1 or TONIC_HF_WEAVE_OFFLINE=1 skips Hub I/O. " +
      "Configure repo id via .tonic/hf-repo.json, profile hub_repo_id, or TONIC_HF_WEAVE_REPO; use hf auth login for Hugging Face.",
  );
}
