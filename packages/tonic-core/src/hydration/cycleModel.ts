import {
  extractHydrationCandidateSymbol,
  inferHydrationCandidateNodeKind,
} from "./astCandidates";
import { HYDRATION_PIPELINE_VERSION } from "./types";
import type {
  HydrationBranchIntent,
  HydrationCandidateTag,
  HydrationConsolidatedPath,
  HydrationConsolidatedSymbol,
  HydrationCycleDelta,
  HydrationCycleNode,
  HydrationCycleRecord,
  HydrationCycleState,
  HydrationCycleTarget,
  HydrationFuzzyAlignmentCandidate,
  HydrationIntentSupport,
  HydrationMetadataConsolidation,
  HydrationQuestionSlot,
  HydrationRetrievalBundle,
  HydrationRetrievalMerge,
} from "./types";

const NOVELTY_DECAY = 0.2;

function scorePathSupport(retrievalMerge: HydrationRetrievalMerge): Array<{ path: string; support: number }> {
  return retrievalMerge.evidence_by_path
    .map((entry) => ({
      path: entry.path,
      support: (entry.slot_ids.length * 2) + entry.chunk_ids.length + Math.max(1, entry.ast_node_ids.length),
    }))
    .sort((left, right) => right.support - left.support || left.path.localeCompare(right.path));
}

function targetKey(target: Pick<HydrationCycleTarget, "level" | "path" | "symbol" | "label">): string {
  return [target.level, target.path ?? "", target.symbol ?? "", target.label].join("\x1f");
}

function toCycleNode(
  target: HydrationCycleTarget,
  sourceSlotIds: string[],
  status: HydrationCycleNode["status"],
): HydrationCycleNode {
  return {
    node_id: target.target_id,
    level: target.level,
    label: target.label,
    path: target.path,
    symbol: target.symbol,
    source_slot_ids: sourceSlotIds,
    status,
  };
}

export function deriveNextCycleTargets(params: {
  retrievalMerge: HydrationRetrievalMerge;
  fuzzyAlignment: HydrationFuzzyAlignmentCandidate[];
  pathVisitCounts: Map<string, number>;
  seenTargetIds: Set<string>;
  maxTargets: number;
}): HydrationCycleTarget[] {
  const rankedPaths = scorePathSupport(params.retrievalMerge);
  const nextTargets: HydrationCycleTarget[] = [];
  const seenKeys = new Set<string>();
  const pushTarget = (target: HydrationCycleTarget): void => {
    if (nextTargets.length >= params.maxTargets) {
      return;
    }
    if (params.seenTargetIds.has(target.target_id)) {
      return;
    }
    const key = targetKey(target);
    if (seenKeys.has(key)) {
      return;
    }
    seenKeys.add(key);
    nextTargets.push(target);
  };

  for (const evidence of rankedPaths.slice(0, Math.max(1, Math.floor(params.maxTargets / 2)))) {
    const exploredCount = params.pathVisitCounts.get(evidence.path) ?? 0;
    const noveltyBoost = Math.max(0, 1 - (exploredCount * NOVELTY_DECAY));
    const targetId = `module:${evidence.path}`;
    pushTarget({
      target_id: targetId,
      level: "module",
      label: evidence.path,
      path: evidence.path,
      source_node_ids: [],
    });
    if (noveltyBoost <= 0.1 && nextTargets.length >= params.maxTargets) {
      break;
    }
  }

  for (const candidate of params.fuzzyAlignment) {
    if (nextTargets.length >= params.maxTargets) {
      break;
    }
    const symbol = extractHydrationCandidateSymbol(candidate);
    const level = inferHydrationCandidateNodeKind(candidate);
    if ((level === "span" || !symbol) && candidate.score < 0.55) {
      continue;
    }
    const targetId = `${level}:${candidate.ast_node_id}`;
    pushTarget({
      target_id: targetId,
      level,
      label: symbol || candidate.ast_node_id,
      path: candidate.path,
      symbol: symbol || undefined,
      source_node_ids: [candidate.ast_node_id],
    });
  }

  if (nextTargets.length === 0) {
    for (const evidence of rankedPaths.slice(0, params.maxTargets)) {
      pushTarget({
        target_id: `span:${evidence.path}:0:0`,
        level: "span",
        label: evidence.path,
        path: evidence.path,
        source_node_ids: [],
      });
    }
  }

  return nextTargets;
}

function sourceSlotIdsForPath(retrievalMerge: HydrationRetrievalMerge, filePath?: string): string[] {
  if (!filePath) {
    return [];
  }
  return retrievalMerge.evidence_by_path.find((entry) => entry.path === filePath)?.slot_ids ?? [];
}

export function buildHydrationCycleRecord(params: {
  cycleNumber: number;
  targets: HydrationCycleTarget[];
  questionSlots: HydrationQuestionSlot[];
  retrievalBundles: HydrationRetrievalBundle[];
  retrievalMerge: HydrationRetrievalMerge;
  fuzzyAlignment: HydrationFuzzyAlignmentCandidate[];
  stopReason?: HydrationCycleRecord["stop_reason"];
}): HydrationCycleRecord {
  const nodesAdded: HydrationCycleNode[] = [];
  for (const target of params.targets) {
    nodesAdded.push(
      toCycleNode(
        target,
        sourceSlotIdsForPath(params.retrievalMerge, target.path),
        "hydrated",
      ),
    );
  }
  return {
    cycle_number: params.cycleNumber,
    targets: params.targets,
    question_slots: params.questionSlots,
    retrieval_bundles: params.retrievalBundles,
    retrieval_merge: params.retrievalMerge,
    fuzzy_alignment: params.fuzzyAlignment,
    nodes_added: nodesAdded,
    stop_reason: params.stopReason,
  };
}

export function buildFinalHydrationCycleState(params: {
  cycles: HydrationCycleRecord[];
  stopReason: HydrationCycleState["stop_reason"];
}): HydrationCycleState {
  const nodes = params.cycles.flatMap((cycle) => cycle.nodes_added);
  return {
    schema: "tonic-hydration-cycle",
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    total_cycles: params.cycles.length,
    stop_reason: params.stopReason,
    nodes,
    cycles: params.cycles,
  };
}

function confidenceBucket(score: number): HydrationCandidateTag["confidence"] {
  if (score >= 6) {
    return "high";
  }
  if (score >= 3) {
    return "medium";
  }
  return "low";
}

export function buildHydrationMetadataConsolidation(params: {
  branchIntents: HydrationBranchIntent[];
  cycles: HydrationCycleRecord[];
}): HydrationMetadataConsolidation {
  const pathSupport = new Map<string, { slotSupport: Set<string>; chunkSupport: Set<string>; cycleSupport: Set<number> }>();
  const symbolSupport = new Map<string, { path: string; count: number; scoreTotal: number }>();
  const cycleDeltas: HydrationCycleDelta[] = [];
  const seenPaths = new Set<string>();
  const seenSymbols = new Set<string>();

  for (const cycle of params.cycles) {
    const cyclePaths = new Set<string>();
    const cycleSymbols = new Set<string>();
    for (const evidence of cycle.retrieval_merge.evidence_by_path) {
      const current = pathSupport.get(evidence.path) ?? {
        slotSupport: new Set<string>(),
        chunkSupport: new Set<string>(),
        cycleSupport: new Set<number>(),
      };
      evidence.slot_ids.forEach((slotId) => current.slotSupport.add(slotId));
      evidence.chunk_ids.forEach((chunkId) => current.chunkSupport.add(chunkId));
      current.cycleSupport.add(cycle.cycle_number);
      pathSupport.set(evidence.path, current);
      cyclePaths.add(evidence.path);
    }
    for (const candidate of cycle.fuzzy_alignment) {
      const symbol = extractHydrationCandidateSymbol(candidate);
      if (!symbol) {
        continue;
      }
      const key = `${candidate.path}\x1f${symbol}`;
      const current = symbolSupport.get(key) ?? { path: candidate.path, count: 0, scoreTotal: 0 };
      current.count += 1;
      current.scoreTotal += candidate.score;
      symbolSupport.set(key, current);
      cycleSymbols.add(key);
    }

    const newPaths = [...cyclePaths].filter((entry) => !seenPaths.has(entry)).sort();
    const repeatedPaths = [...cyclePaths].filter((entry) => seenPaths.has(entry)).sort();
    const newSymbols = [...cycleSymbols].filter((entry) => !seenSymbols.has(entry)).sort();
    const repeatedSymbols = [...cycleSymbols].filter((entry) => seenSymbols.has(entry)).sort();
    newPaths.forEach((entry) => seenPaths.add(entry));
    newSymbols.forEach((entry) => seenSymbols.add(entry));
    const totalSignals = cyclePaths.size + cycleSymbols.size;
    const noveltySignals = newPaths.length + newSymbols.length;
    cycleDeltas.push({
      cycle_number: cycle.cycle_number,
      new_paths: newPaths,
      repeated_paths: repeatedPaths,
      new_symbols: newSymbols.map((entry) => entry.split("\x1f")[1] ?? entry),
      repeated_symbols: repeatedSymbols.map((entry) => entry.split("\x1f")[1] ?? entry),
      novelty_ratio: totalSignals === 0 ? 0 : Number((noveltySignals / totalSignals).toFixed(6)),
    });
  }

  const pathsRanked: HydrationConsolidatedPath[] = [...pathSupport.entries()]
    .map(([filePath, support]) => {
      const supportScore = (support.slotSupport.size * 2) + support.chunkSupport.size + support.cycleSupport.size;
      return {
        path: filePath,
        support: supportScore,
        slot_support: support.slotSupport.size,
        chunk_support: support.chunkSupport.size,
        cycle_support: support.cycleSupport.size,
        novelty_score: Number((1 / Math.max(1, support.cycleSupport.size)).toFixed(6)),
      };
    })
    .sort((left, right) => right.support - left.support || left.path.localeCompare(right.path))
    .slice(0, 32);

  const symbolsRanked: HydrationConsolidatedSymbol[] = [...symbolSupport.entries()]
    .map(([key, value]) => {
      const [, symbol] = key.split("\x1f");
      return {
        symbol: symbol ?? key,
        path: value.path,
        support: value.count,
        avg_score: Number((value.scoreTotal / Math.max(1, value.count)).toFixed(6)),
      };
    })
    .sort((left, right) => right.support - left.support || right.avg_score - left.avg_score || left.symbol.localeCompare(right.symbol))
    .slice(0, 32);

  const intentSupport: HydrationIntentSupport[] = params.branchIntents.map((intent, index) => {
    const pathSlice = pathsRanked.slice(index * 2, (index * 2) + 3);
    const symbolSlice = symbolsRanked.slice(index * 2, (index * 2) + 3);
    const score = pathSlice.reduce((sum, entry) => sum + entry.support, 0) + symbolSlice.reduce((sum, entry) => sum + entry.support, 0);
    return {
      intent_id: intent.intent_id,
      description: intent.description,
      support_paths: pathSlice.map((entry) => entry.path),
      support_symbols: symbolSlice.map((entry) => entry.symbol),
      support_score: score,
    };
  });

  const candidateTags: HydrationCandidateTag[] = [];
  const primaryIntent = params.branchIntents[0];
  if (primaryIntent) {
    candidateTags.push({
      key: "tonic.ai.intent",
      value: primaryIntent.description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "hydration",
      support: Math.max(1, intentSupport[0]?.support_score ?? 1),
      confidence: confidenceBucket(intentSupport[0]?.support_score ?? 1),
    });
  }
  for (const pathEntry of pathsRanked.slice(0, 2)) {
    candidateTags.push({
      key: "tonic.ai.path",
      value: pathEntry.path,
      support: pathEntry.support,
      confidence: confidenceBucket(pathEntry.support),
    });
  }
  for (const symbolEntry of symbolsRanked.slice(0, 2)) {
    candidateTags.push({
      key: "tonic.ai.symbol",
      value: symbolEntry.symbol,
      support: symbolEntry.support,
      confidence: confidenceBucket(symbolEntry.support),
    });
  }

  return {
    schema: "tonic-hydration-metadata-consolidation",
    pipeline_version: HYDRATION_PIPELINE_VERSION,
    paths_ranked: pathsRanked,
    symbols_ranked: symbolsRanked,
    intent_support: intentSupport,
    cycle_deltas: cycleDeltas,
    candidate_tags: candidateTags,
  };
}
