import { TaskMemoryCommitInput, TaskMemoryCommitResult } from "../../types/memory";

export interface IAgentMemory {
  commitTaskMemories(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult>;
}
