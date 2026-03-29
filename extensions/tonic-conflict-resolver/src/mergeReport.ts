/**
 * JSON report emitted by mergetonic-github-agent (schemas/merge-tonic-report.schema.json).
 */

export interface ConflictRegionJson {
  base_content: string;
  left_content: string;
  right_content: string;
  start_line: number;
  end_line: number;
  conflict_kind: string;
  conflict_base_kind?: string;
  conflict_tags?: Record<string, string>;
  left_commit_ids?: string[];
  right_commit_ids?: string[];
  /** When begin/mid Tonic marker labels differ (e.g. per-side author/intent). */
  marker_label_begin?: string;
  marker_label_mid?: string;
}

export interface MergeArtifactJson {
  version?: string;
  path: string;
  base_sha?: string;
  head_sha?: string;
  left_line_count?: number;
  right_line_count?: number;
  merged_line_count?: number;
  markers_present?: boolean;
  conflict_region_count?: number;
  conflict_regions?: ConflictRegionJson[];
  left_commit_id?: string;
  right_commit_id?: string;
  /** Present for conflicted files in current agents (`embed_annotated_for_marker_files`). Older reports may omit it while still setting `markers_present`. */
  annotated_lines?: string[];
}

export interface MergeReportJson {
  schema?: string;
  report_version?: string;
  run_id?: string;
  pr_title?: string;
  base_sha?: string;
  head_sha?: string;
  base_ref?: string;
  head_ref?: string;
  marker_branch?: string;
  marker_branch_commit?: string;
  marker_paths?: string[];
  merge_report_artifact_name?: string;
  files: MergeArtifactJson[];
}

export function parseMergeReportJson(text: string): MergeReportJson {
  const raw: unknown = JSON.parse(text);
  if (typeof raw !== "object" || raw === null || !("files" in raw)) {
    throw new Error("Tonic report: missing top-level 'files' array");
  }
  const files = (raw as { files: unknown }).files;
  if (!Array.isArray(files)) {
    throw new Error("Tonic report: 'files' must be an array");
  }
  return raw as MergeReportJson;
}
