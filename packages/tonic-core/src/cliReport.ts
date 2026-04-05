/** Merge report JSON shape (shared with GitHub agents / VS Code import). */

export type MergeArtifactJson = {
  version: string;
  path: string;
  base_sha: string;
  head_sha: string;
  left_line_count: number;
  right_line_count: number;
  merged_line_count: number;
  markers_present: boolean;
  conflict_region_count: number;
  conflict_regions: Array<Record<string, unknown>>;
  left_commit_id?: string;
  right_commit_id?: string;
  annotated_lines?: string[];
  /** Present for merge-base-aware three-way compare */
  merge_base_sha?: string;
  compare_three?: boolean;
  weave_merge?: boolean;
  /** Set when compare-three used weave merge driver write-back */
  weave_writeback?: "weave";
};

const MERGE_ARTIFACT_VERSION = "1";

export function artifactToDict(
  a: MergeArtifactJson,
  includeAnnotated: boolean,
): Record<string, unknown> {
  const d: Record<string, unknown> = {
    version: a.version,
    path: a.path,
    base_sha: a.base_sha,
    head_sha: a.head_sha,
    left_line_count: a.left_line_count,
    right_line_count: a.right_line_count,
    merged_line_count: a.merged_line_count,
    markers_present: a.markers_present,
    conflict_region_count: a.conflict_region_count,
    conflict_regions: a.conflict_regions,
  };
  if (a.left_commit_id) {
    d.left_commit_id = a.left_commit_id;
  }
  if (a.right_commit_id) {
    d.right_commit_id = a.right_commit_id;
  }
  if (a.merge_base_sha) {
    d.merge_base_sha = a.merge_base_sha;
  }
  if (a.compare_three) {
    d.compare_three = a.compare_three;
  }
  if (a.weave_merge) {
    d.weave_merge = a.weave_merge;
  }
  if (a.weave_writeback) {
    d.weave_writeback = a.weave_writeback;
  }
  if (includeAnnotated) {
    d.annotated_lines = a.annotated_lines;
  }
  return d;
}

export function mergeReportDict(params: {
  runId: string;
  prTitle: string;
  baseSha: string;
  headSha: string;
  baseRef: string;
  headRef: string;
  artifacts: MergeArtifactJson[];
  includeAnnotated: boolean;
  embedAnnotatedForMarkerFiles: boolean;
  markerBranch?: string | null;
  markerBranchCommit?: string | null;
  markerPaths?: string[];
  mergeReportArtifactName?: string | null;
  mergeBaseSha?: string;
  leftRef?: string;
  rightRef?: string;
  compareMode?: string;
  tonicRepoProfile?: Record<string, unknown>;
}): Record<string, unknown> {
  const files = params.artifacts.map((a) => {
    const inc =
      params.includeAnnotated || (params.embedAnnotatedForMarkerFiles && a.markers_present);
    return artifactToDict(a, inc);
  });
  const out: Record<string, unknown> = {
    schema: "merge-tonic-report",
    report_version: MERGE_ARTIFACT_VERSION,
    run_id: params.runId,
    pr_title: params.prTitle,
    base_sha: params.baseSha,
    head_sha: params.headSha,
    base_ref: params.baseRef,
    head_ref: params.headRef,
    files,
  };
  if (params.markerBranch) {
    out.marker_branch = params.markerBranch;
  }
  if (params.markerBranchCommit) {
    out.marker_branch_commit = params.markerBranchCommit;
  }
  if (params.markerPaths?.length) {
    out.marker_paths = params.markerPaths;
  }
  if (params.mergeReportArtifactName) {
    out.merge_report_artifact_name = params.mergeReportArtifactName;
  }
  if (params.mergeBaseSha) {
    out.merge_base_sha = params.mergeBaseSha;
  }
  if (params.leftRef) {
    out.left_ref = params.leftRef;
  }
  if (params.rightRef) {
    out.right_ref = params.rightRef;
  }
  if (params.compareMode) {
    out.compare_mode = params.compareMode;
  }
  if (params.tonicRepoProfile) {
    out.tonic_repo_profile = params.tonicRepoProfile;
  }
  return out;
}

export { MERGE_ARTIFACT_VERSION };
