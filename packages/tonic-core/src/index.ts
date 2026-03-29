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
