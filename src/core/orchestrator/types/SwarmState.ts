/**
 * Swarm-level state management for DAG execution.
 * Following the Branch & Merge / Reducer pattern for structured facts.
 */

export interface SwarmFact {
  value: any;
  confidence: number;
  sourceNodeId: string;
  updatedAt: number;
}

export interface SwarmState {
  /**
   * Global structured facts shared across the swarm.
   * Example: {"price": {value: 99.9, confidence: 0.9, sourceNodeId: "node_1", updatedAt: 12345678}}
   */
  blackboard: Record<string, SwarmFact>;

  /**
   * Lightweight execution breadcrumbs or markers.
   * Example: ["user_logged_in", "search_results_found"]
   */
  markers: string[];

  /**
   * Shared execution context (short summaries of predecessor outcomes).
   */
  sharedContext: string[];
}

/**
 * Reducer for merging sub-agent patches into the main swarm state.
 * Implements conflict resolution based on confidence and recency.
 */
export function reduceSwarmState(current: SwarmState, patch: Partial<SwarmState>): SwarmState {
  const newBlackboard = { ...current.blackboard };

  if (patch.blackboard) {
    for (const [key, newFact] of Object.entries(patch.blackboard)) {
      const existing = newBlackboard[key];
      // Conflict resolution: Higher confidence wins. 
      // If same confidence, the newer one (higher updatedAt) wins.
      if (
        !existing ||
        newFact.confidence > existing.confidence ||
        (newFact.confidence === existing.confidence && newFact.updatedAt >= existing.updatedAt)
      ) {
        newBlackboard[key] = newFact;
      }
    }
  }

  const newMarkers = Array.from(new Set([...current.markers, ...(patch.markers || [])]));
  const newSharedContext = Array.from(new Set([...current.sharedContext, ...(patch.sharedContext || [])]));

  return {
    blackboard: newBlackboard,
    markers: newMarkers,
    sharedContext: newSharedContext,
  };
}

export function createInitialSwarmState(): SwarmState {
  return {
    blackboard: {},
    markers: [],
    sharedContext: [],
  };
}

/**
 * Builds a minimal history entry for an orchestrator-level DAG finish event.
 * The shape matches what `buildHistoryEvidence()` in candidate-extractor reads:
 *   item.step, item.action.type, item.step_summary, item.result
 */
export function buildOrchestratorFinishHistoryEntry(summary?: string) {
  return {
    step: 1,
    action: { type: "finish", description: summary },
    result: null,
    step_summary: summary,
  };
}
