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
} from "./conflictParser";
export {
  parseGitConflicts,
  parseGitConflictsWithDiagnostics,
  hasGitConflictMarkers,
} from "./gitConflictParser";
export {
  gitConflictBlocksToConflictRegions,
  gitConflictBlocksToTonicAnnotatedPreview,
} from "./markerInterop";
export {
  mergeSnapshots,
  annotatedToConflictFile,
  conflictRegionsToAnnotatedLines,
  conflictFileFromBlocks,
  heuristicResolvedLines,
  suggestionLineCountOk,
  applyTonicResolutions,
  applyTonicHeuristic,
  type ConflictFile,
  type ConflictRegion,
} from "./mergeUtils";
