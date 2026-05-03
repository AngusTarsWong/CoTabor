import { IAgentMemory } from "./interface";
import { TaskMemoryCommitInput, TaskMemoryCommitResult } from "../../types/memory";
import { TaskMemoryCommitter } from "../../../memory/task-commit";

/**
 * Local memory provider:
 * 1. candidate extraction from task final state
 * 2. LLM-based L1/L2/L3 classification
 * 3. formal memory write into local IndexedDB + sync queue
 */
export class LocalMemoryProvider implements IAgentMemory {
  private committer = new TaskMemoryCommitter();

  async commitTaskMemories(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    return this.committer.commit(input);
  }
}
