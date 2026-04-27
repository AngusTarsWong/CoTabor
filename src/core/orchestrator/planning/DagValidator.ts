import { DagValidationResult, SubtaskDag } from "../types/SubtaskDag";

export function validateSubtaskDag(dag: SubtaskDag): DagValidationResult {
  const errors: string[] = [];
  const nodes = dag.nodes;
  const nodeIds = Object.keys(nodes);
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  nodeIds.forEach((id) => {
    indegree.set(id, 0);
    adjacency.set(id, []);
  });

  nodeIds.forEach((id) => {
    const node = nodes[id];
    const uniqueDepends = new Set(node.dependsOn);
    if (uniqueDepends.size !== node.dependsOn.length) {
      errors.push(`Task ${id} has duplicate dependencies.`);
    }

    uniqueDepends.forEach((depId) => {
      if (depId === id) {
        errors.push(`Task ${id} cannot depend on itself.`);
        return;
      }
      if (!nodes[depId]) {
        errors.push(`Task ${id} depends on missing task ${depId}.`);
        return;
      }

      indegree.set(id, (indegree.get(id) || 0) + 1);
      adjacency.get(depId)!.push(id);
    });
  });

  const queue: string[] = nodeIds.filter((id) => (indegree.get(id) || 0) === 0);
  const topoOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    topoOrder.push(current);
    for (const next of adjacency.get(current) || []) {
      const newIndegree = (indegree.get(next) || 0) - 1;
      indegree.set(next, newIndegree);
      if (newIndegree === 0) {
        queue.push(next);
      }
    }
  }

  const hasCycle = topoOrder.length !== nodeIds.length;
  if (hasCycle) {
    errors.push("Task DAG contains a cycle.");
  }

  const roots = nodeIds.filter((id) => nodes[id].dependsOn.length === 0);

  return {
    valid: errors.length === 0,
    errors,
    roots,
    topoOrder,
  };
}
