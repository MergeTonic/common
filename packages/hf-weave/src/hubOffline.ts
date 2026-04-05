/** Match `hub_offline` in merge-tonic-lib `tonic/hf_weave/client.py`. */
export function hubWeaveOffline(): boolean {
  for (const key of ["TONIC_HF_WEAVE_OFFLINE", "HF_HUB_OFFLINE"] as const) {
    const v = (process.env[key] ?? "").toLowerCase();
    if (v === "1" || v === "true" || v === "yes") {
      return true;
    }
  }
  return false;
}
