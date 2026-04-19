import { TaskMemoryCommitInput, TaskMemoryCommitResult } from "../../shared/types/memory";
import { experienceJobScheduler } from "../experience-job/scheduler";

export class TaskMemoryCommitter {
  async commit(input: TaskMemoryCommitInput): Promise<TaskMemoryCommitResult> {
    return experienceJobScheduler.schedule(input);
  }
}
