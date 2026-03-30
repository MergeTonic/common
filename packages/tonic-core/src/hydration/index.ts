export {
  buildHydrationAstCandidates,
  extractHydrationCandidateSymbol,
  inferHydrationCandidateNodeKind,
} from "./astCandidates";
export {
  runAgenticCodeSearchSession,
  type AgenticCodeSearchChunk,
  type AgenticCodeSearchLlmEvent,
  type AgenticCodeSearchOutcome,
  type AgenticCodeSearchSession,
  type AgenticCodeSearchStep,
  type AgenticCodeSearchStepKind,
  type AgenticCodeSearchStepStatus,
  type RunAgenticCodeSearchSessionParams,
} from "./agenticCodeSearch";
export {
  runHydrateIntentsMachineMode,
  type HydrationHistoricalOptions,
  type RunHydrateIntentsOptions,
  type RunHydrateIntentsResult,
} from "./hydrateIntents";
export {
  buildFinalHydrationCycleState,
  buildHydrationCycleRecord,
  buildHydrationMetadataConsolidation,
  deriveNextCycleTargets,
} from "./cycleModel";
export {
  buildHydrationCycleState,
  buildHydrationFuzzyAlignment,
  planHydrationQuestionSlots,
  synthesizeHydrationMetadata,
  type HydrationIntentLlmEvent,
  type HydrationTagSynthesis,
} from "./intentHydration";
export {
  HYDRATION_INTENT_RESULT_SCHEMA,
  HYDRATION_PIPELINE_SCHEMA,
  HYDRATION_PIPELINE_VERSION,
  HYDRATION_OPTIONAL_AI_EXIT_CODE,
  type HydrationArtifactPaths,
  type HydrationAstNodeKind,
  type HydrationBranchIntent,
  type HydrationBranchIntentCollection,
  type HydrationCandidateTag,
  type HydrationConsolidatedPath,
  type HydrationConsolidatedSymbol,
  type HydrationCycleDelta,
  type HydrationCycleNode,
  type HydrationCycleRecord,
  type HydrationCycleState,
  type HydrationCycleTarget,
  type HydrationFuzzyAlignmentCandidate,
  type HydrationIntentTag,
  type HydrationIntentSupport,
  type HydrationMetadataConsolidation,
  type HydrationMergedEvidence,
  type HydrationPipelineArtifacts,
  type HydrationPipelineRun,
  type HydrationPipelineStageState,
  type HydrationQuestionPlan,
  type HydrationQuestionSlot,
  type HydrationRetrievalMerge,
  type HydrationRetrievalAstCandidate,
  type HydrationRetrievalBundle,
  type HydrationRetrievalHit,
  type HydrationRunResult,
  type HydrationSkipReason,
  type HydrationStageStatus,
  type VectorBackendKind,
} from "./types";
export {
  createHydrationChromaClient,
  getHydrationChromaCollection,
  loadHydrationChromaModule,
  parseHydrationChromaUrl,
  probeHydrationChromaHeartbeat,
  type ChromaClientLike,
  type ChromaCollection,
  type HydrationChromaHeartbeat,
  type HydrationChromaUrl,
} from "./chromaClient";
export {
  buildBaseAgenticExecuteStepUserPrompt,
  buildBcpExecuteStepUserPrompt,
  buildCodeSearchExecuteStepUserPrompt,
  formatAgenticPromptTemplate,
  buildGuidedQuestionGenerationPrompt,
  buildHydrationSynthesisPrompt,
  loadAgenticPrompts,
  formatHydrationPromptTemplate,
  loadConflictPrompts,
  loadHydrationPrompts,
  type AgenticPromptContext,
  type AgenticPromptContextHistory,
  type AgenticPromptContextHistoryChunk,
  type AgenticPromptContextStep,
  type AgenticPromptBundle,
  type AgenticPromptSection,
  type ConflictPromptBundle,
  type HydrationPromptBundle,
} from "./promptBundle";
export {
  LineTokenEstimateChunker,
  type ChunkerConfig,
  type HydrationChunk,
} from "./chunker";
export {
  DeterministicFakeEmbedder,
  type Embedder,
} from "./embedder";
export {
  OptionalAiDependencyError,
  HydrationPersistError,
  HydrationRuntimeError,
} from "./errors";
export {
  createHydrationIndexState,
  HYDRATION_INDEX_STATE_COMPATIBILITY_VERSION,
  HYDRATION_INDEX_STATE_SCHEMA,
  isHydrationIndexStateCompatible,
  loadHydrationIndexState,
  saveHydrationIndexState,
  type HydrationIndexState,
} from "./indexState";
export {
  appendHydrationLlmTranscriptEvent,
  type HydrationLlmTranscriptEvent,
} from "./llmTranscript";
export {
  createHydrationLlmService,
  type HydrationLlmMessage,
  type HydrationLlmRole,
  type HydrationLlmService,
} from "./llmService";
export {
  runHydrationToolWithMiddleware,
  type HydrationSearchMiddleware,
  type HydrationToolCallContext,
} from "./middleware";
export {
  HydrationIndexer,
  type HydrationIndexerOptions,
  type HydrationIndexSyncResult,
} from "./indexer";
export {
  extractRegexCandidates,
  extractSymbolCandidates,
  getFileContent,
  hybridSearchRecords,
  lexicalSearchRecords,
  listFiles,
  mergeSearchRecords,
  regexSearchRecords,
  semanticSearchRecords,
  symbolSearchRecords,
  type CodeSearchRecord,
} from "./searchTools";
export {
  MemoryVectorIndex,
} from "./memoryVectorIndex";
export {
  createDefaultHydrationPipelineStages,
  HYDRATION_PIPELINE_STAGE_IDS,
  type HydrationPipelineStageId,
} from "./pipelineGraph";
export {
  HYDRATION_CHROMADB_NPM_PACKAGE,
  HYDRATION_CHROMADB_SERVER_IMAGE,
  HYDRATION_CHROMADB_VERSION,
  HYDRATION_OPTIONAL_DEPENDENCY_GROUP,
  buildMissingOptionalAiDependencySkipResult,
  probeHydrationOptionalAiDependency,
  type HydrationOptionalAiProbe,
} from "./optionalAi";
export {
  DEFAULT_CHROMA_DIR_NAME,
  DEFAULT_HYDRATION_RUNS_DIR_NAME,
  DEFAULT_INDEX_STATE_FILE_NAME,
  DEFAULT_TONIC_DIR_NAME,
  resolveHydrationArtifactPaths,
  type HydrationPathOptions,
} from "./paths";
export {
  HydrationRepository,
  type HydrationRepositoryFile,
  type HydrationRepositoryOptions,
} from "./repository";
export {
  acquireHydrationPersistLock,
  assertHydrationPersistHealth,
  buildHydrationCacheKey,
  checkHydrationPersistHealth,
  HYDRATION_CACHE_KEY_SCHEMA_VERSION,
  HYDRATION_PERSIST_LOCK_FILE_NAME,
  HYDRATION_PERSIST_MANIFEST_FILE_NAME,
  HYDRATION_PERSIST_MANIFEST_SCHEMA,
  loadHydrationPersistManifest,
  resolveHydrationPersistManifestPath,
  writeHydrationPersistManifest,
  type HydrationCacheKey,
  type HydrationCacheKeyParts,
  type HydrationPersistHealth,
  type HydrationPersistLock,
  type HydrationPersistManifest,
} from "./persistence";
export {
  buildHydrationRetrievalMerge,
  createHydrationBranchIntentCollection,
  createHydrationCycleState,
  createHydrationPipelineRun,
  createHydrationQuestionPlan,
  defaultHydrationRunId,
  finalizeHydrationPipelineRun,
  loadHydrationPipelineRun,
  markStageArtifactWritten,
  resolveHydrationRunDirectory,
  saveHydrationPipelineRun,
  updateHydrationPipelineStage,
  writeHydrationArtifact,
} from "./runState";
export {
  createHydrationRuntime,
  probeHydrationRuntimeReadiness,
  type HydrationRuntime,
} from "./runtime";
export {
  resolveHydrationLlmConfig,
  type HydrationLlmConfig,
  type HydrationLlmMode,
} from "./llmConfig";
export {
  defaultHydrationCollectionName,
  resolveHydrationRuntimeConfig,
  runtimeModeToBackend,
  type HydrationRuntimeConfig,
  type HydrationRuntimeMode,
} from "./runtimeConfig";
export {
  type VectorFilter,
  type VectorIndex,
  type VectorMetadata,
  type VectorMetadataValue,
  type VectorRecord,
  type VectorSearchResult,
} from "./vectorIndex";
