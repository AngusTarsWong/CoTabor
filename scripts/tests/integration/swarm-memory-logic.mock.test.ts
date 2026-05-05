import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMemoryCandidates } from "../../../src/memory/task-commit/candidate-extractor";
import { TaskMemoryCommitInput } from "../../../src/shared/types/memory";

describe("Logic: Swarm L3 Memory Extraction", () => {
  it("should extract a strategic L3 candidate from a completed DAG run", async () => {
    const dagInput: TaskMemoryCommitInput = {
      goal: "Compare smartphone prices",
      finalState: {
        status: "FINISHED",
        dag_run_id: "dag_123",
        dag_execution_mode: "isolated_tabs",
        final_summary: "Found JD: 5000, TMall: 5100. JD is cheaper.",
        subtask_dag: {
          nodes: {
            "node_1": { id: "node_1", title: "Search JD", description: "Search price on JD" },
            "node_2": { id: "node_2", title: "Search TMall", description: "Search price on TMall" },
            "node_3": { id: "node_3", title: "Summarize", description: "Compare results" }
          }
        },
        total_history: [
            { ts: Date.now(), node: "orchestrator", type: "finish" }
        ]
      }
    };

    const candidates = extractMemoryCandidates(dagInput);
    
    const swarmCandidate = candidates.find(c => c.text.includes("蜂群协作策略复盘"));
    
    assert.ok(swarmCandidate, "Should have extracted a swarm strategic candidate");
    assert.equal(swarmCandidate.source, "task_wisdom", "Swarm candidate should be task_wisdom");
    assert.ok(swarmCandidate.text.includes("Search JD"), "Candidate text should include subtask titles");
    assert.ok(swarmCandidate.text.includes("JD is cheaper"), "Candidate text should include the final summary");
    assert.ok(swarmCandidate.text.includes("DAG 拓扑结构"), "Candidate should recommend the DAG pattern");
  });
});
