import type { TaskDefinition } from "./types";

const tasks = new Map<string, TaskDefinition>();

function register(task: TaskDefinition) {
  tasks.set(task.id, task);
}

export const taskRegistry = {
  get(id: string): TaskDefinition | undefined {
    return tasks.get(id);
  },
  list(): TaskDefinition[] {
    return Array.from(tasks.values());
  },
};
