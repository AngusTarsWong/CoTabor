import { SubtaskDag, SubtaskNode } from "../types/SubtaskDag";

interface RawDependencyTask {
  id?: string;
  title?: string;
  goal?: string;
  description?: string;
  dependsOn?: string[];
  depends_on?: string[];
  maxAttempts?: number;
  metadata?: Record<string, any>;
}

interface BuildInput {
  tasks: RawDependencyTask[];
}

function normalizeDependsOn(task: RawDependencyTask): string[] {
  const source = task.dependsOn ?? task.depends_on ?? [];
  return source.filter((id): id is string => Boolean(id && typeof id === "string"));
}

function normalizeTitle(task: RawDependencyTask, fallbackId: string): string {
  const title = task.title || task.goal || task.description || fallbackId;
  return String(title).trim() || fallbackId;
}

export function buildSubtaskDag(input: BuildInput): SubtaskDag {
  const nodes: Record<string, SubtaskNode> = {};
  input.tasks.forEach((task, index) => {
    const id = (task.id || `task_${index + 1}`).trim();
    nodes[id] = {
      id,
      title: normalizeTitle(task, id),
      description: task.description,
      dependsOn: normalizeDependsOn(task),
      status: "pending",
      attempt: 0,
      maxAttempts: Math.max(1, task.maxAttempts ?? 2),
      metadata: task.metadata,
    };
  });

  const roots = Object.values(nodes)
    .filter((node) => node.dependsOn.length === 0)
    .map((node) => node.id);

  return {
    nodes,
    roots,
    hasCycle: false,
  };
}
