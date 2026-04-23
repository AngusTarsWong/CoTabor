import type { TaskDefinition } from "./types";
import { googleNewsToNotion } from "./google-news-to-notion";

const tasks = new Map<string, TaskDefinition>();

function register(task: TaskDefinition) {
  tasks.set(task.id, task);
}

register(googleNewsToNotion);

export const taskRegistry = {
  get(id: string): TaskDefinition | undefined {
    return tasks.get(id);
  },
  list(): TaskDefinition[] {
    return Array.from(tasks.values());
  },
};
