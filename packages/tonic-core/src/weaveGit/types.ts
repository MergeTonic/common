export type PathManifestEntry = {
  text_blob_sha: string;
  weave_serialized_sha: string;
  weave_format_version: string;
  diff_engine_id: string;
  parent_weave_shas?: string[];
  degraded?: boolean;
  squash?: boolean;
  weave_object_key?: string;
  replay_trace_key?: string;
};

export type TonicGitManifest = {
  schema: "tonic-git-manifest";
  version: "1";
  commit: string;
  diff_engine_id?: string;
  weave_format_version?: string;
  paths: Record<string, PathManifestEntry>;
};
