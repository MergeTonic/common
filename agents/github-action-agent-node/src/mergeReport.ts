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
  astHydration?: Record<string, unknown> | null;
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
  if (params.astHydration && Object.keys(params.astHydration).length > 0) {
    out.ast_hydration = params.astHydration;
  }
  return out;
}

export { MERGE_ARTIFACT_VERSION };
