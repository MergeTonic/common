export {
  initialState,
  currentLines,
  updateState,
  mergeStates,
} from "./core";
export {
  CONFLICT_ADDED_LEFT,
  CONFLICT_ADDED_RIGHT,
  CONFLICT_ADDED_BOTH,
  CONFLICT_DELETED_LEFT,
  CONFLICT_DELETED_RIGHT,
  PEACE,
  conflictStrings,
  END_MARKER,
  showConflicts,
  conflictCode,
} from "./conflicts";
export { serializeState, deserializeState, type StateRow } from "./state";
export {
  buildVisibleWeaveMaps,
  inspectRowsJson,
  splitWeaveIndexAfterVisible,
  visibleLineCount,
  visibleRangeToWeaveIndices,
  WeaveIntrospectError,
  type WeaveRowView,
} from "./weaveIntrospect";
export {
  extractWeaveRows,
  spliceWeaveRows,
  WeaveExtractError,
  WeaveSpliceError,
} from "./weaveSlice";
export {
  parseTonicConflicts,
  parseTonicConflictsWithDiagnostics,
  conflictSummary,
  type ConflictBlock,
  type ConflictSegment,
} from "./conflictParser";
export {
  parseConflictLabel,
  formatConflictLabel,
  addTagToConflictLabel,
  removeTagFromConflictLabel,
  updateTagInConflictLabel,
  normalizeConflictLabel,
  sanitizeAuthorTagToken,
  type ConflictLabelMetadata,
} from "./markerLabel";
export {
  parseGitConflicts,
  parseGitConflictsWithDiagnostics,
  hasGitConflictMarkers,
} from "./gitConflictParser";
export {
  gitConflictBlocksToConflictRegions,
  gitConflictBlocksToTonicAnnotatedPreview,
  DEFAULT_GIT_MERGE_LEFT_INTENT,
  DEFAULT_GIT_MERGE_RIGHT_INTENT,
  type GitMergeHydrationOptions,
} from "./markerInterop";
export {
  resolveAuthorAliasForSide,
  humanAliasFromGitStdout,
  parseGitAuthorNameEmail,
  createDefaultGitAuthorProbe,
  type AuthorMode,
  type ResolveAuthorAliasParams,
} from "./authorAliasResolver";
export {
  loadIntentProfile,
  saveIntentProfile,
  parseIntentPair,
  promptIntentPairInteractive,
  DEFAULT_INTENT_PROFILE_PATH,
  type IntentProfileV1,
} from "./intentInteractive";
export {
  EXIT_AST_GREP_MISSING,
  EXIT_INVALID_ARGS,
  EXIT_OK,
  EXIT_PARTIAL,
  EXIT_SCAN_FAILED,
  type AstGrepCliOptions,
  type AstHydrationArtifactV1,
  type HydrationRunArtifactV1,
  type NormalizedMatch,
} from "./astGrep/types";
export { parseAstGrepHydrateArgv, runAstGrepHydrate, runAstGrepHydrateFromArgv } from "./astGrep/command";
export { runAstGrepScan } from "./astGrep/runner";
export { runHydrationPipeline, type HydrateCliOptions } from "./hydration/pipeline";
export { parseHydrateArgv, runHydrationPipelineFromArgv } from "./hydration/hydrateCommand";
export {
  mergeSnapshots,
  annotatedToConflictFile,
  conflictRegionsToAnnotatedLines,
  conflictFileFromBlocks,
  heuristicResolvedLines,
  suggestionLineCountOk,
  applyTonicResolutions,
  applyTonicHeuristic,
  hydrateTonicAnnotatedAuthorIntent,
  type ConflictFile,
  type ConflictRegion,
  type TonicAuthorIntentHydration,
} from "./mergeUtils";
export type { PathManifestEntry, TonicGitManifest } from "./weaveGit/types";
export {
  parseManifestJson,
  serializeManifestJson,
  pathEntryForFile,
} from "./weaveGit/manifest";
export { normalizeLf, sha256HexUtf8, sha256HexBytes } from "./weaveGit/hashutil";
export {
  applyLfsPointerChecks,
  verifyManifest,
  verifyReportDict,
  verifyReportJson,
  verifyReportStatus,
  verifyStaged,
  weaveBlobPath,
  DEFAULT_WEAVE_ROOT,
  type VerifyResult,
  type VerifyCheck,
  type VerifyError,
} from "./weaveGit/verify";
export { findLfsPointersUnder, isLfsPointer } from "./weaveGit/lfs";
