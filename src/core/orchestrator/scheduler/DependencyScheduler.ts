import { SchedulerDecision, SchedulerRuntimeState } from "../types/SchedulerState";
import { SubtaskDag, SubtaskNode, SubtaskStatus } from "../types/SubtaskDag";
import { computeRetryDecision } from "../runtime/RetryPolicy";

export interface MarkResultInput {
  id: string;
  success: boolean;
  outputRef?: SubtaskNode["outputRef"];
  error?: { code: string; message: string; retryable: boolean };
}

export class DependencyScheduler {
  private dag: SubtaskDag;
  private reverseDeps: Map<string, string[]> = new Map();
  private indegree: Map<string, number> = new Map();
  private state: SchedulerRuntimeState;

  constructor(dag: SubtaskDag, runId: string) {
    this.dag = dag;
    this.state = {
      runId,
      readyQueue: [],
      running: [],
      completed: [],
      failed: [],
      blocked: [],
      cancelRequested: false,
      paused: false,
      updatedAt: Date.now(),
    };
    this.buildIndexes();
    this.seedReadyQueue();
  }

  getState(): SchedulerRuntimeState {
    return { ...this.state, updatedAt: Date.now() };
  }

  isDone(): boolean {
    return this.computeDone();
  }

  getDag(): SubtaskDag {
    return this.dag;
  }

  requestCancel() {
    this.state.cancelRequested = true;
    this.state.updatedAt = Date.now();
  }

  decide(maxParallel: number): SchedulerDecision {
    if (this.state.cancelRequested || this.state.paused) {
      return { launch: [], done: this.isDone() };
    }

    const available = Math.max(0, maxParallel - this.state.running.length);
    const launch: string[] = [];
    while (launch.length < available && this.state.readyQueue.length > 0) {
      const id = this.state.readyQueue.shift()!;
      const node = this.dag.nodes[id];
      if (!node || node.status !== "ready") continue;
      node.status = "running";
      this.state.running.push(id);
      launch.push(id);
    }

    this.state.updatedAt = Date.now();
    return { launch, done: this.computeDone() };
  }

  markResult(input: MarkResultInput) {
    const node = this.dag.nodes[input.id];
    if (!node) return;

    this.state.running = this.state.running.filter((id) => id !== input.id);

    if (input.success) {
      node.status = "succeeded";
      node.error = undefined;
      node.outputRef = input.outputRef;
      if (!this.state.completed.includes(input.id)) {
        this.state.completed.push(input.id);
      }
      this.releaseDependents(input.id);
      this.state.updatedAt = Date.now();
      return;
    }

    node.error = input.error;
    node.attempt = node.attempt + 1;
    const retryDecision = computeRetryDecision(
      node.attempt,
      node.maxAttempts,
      Boolean(input.error?.retryable),
    );

    if (retryDecision.shouldRetry) {
      node.status = "ready";
      this.state.readyQueue.push(node.id);
      this.state.updatedAt = Date.now();
      return;
    }

    node.status = "failed";
    if (!this.state.failed.includes(node.id)) {
      this.state.failed.push(node.id);
    }
    this.blockDescendants(node.id);
    this.state.updatedAt = Date.now();
  }

  private buildIndexes() {
    const nodeIds = Object.keys(this.dag.nodes);
    nodeIds.forEach((id) => {
      this.indegree.set(id, this.dag.nodes[id].dependsOn.length);
      this.reverseDeps.set(id, []);
    });

    nodeIds.forEach((id) => {
      for (const dep of this.dag.nodes[id].dependsOn) {
        const list = this.reverseDeps.get(dep);
        if (list) list.push(id);
      }
    });
  }

  private seedReadyQueue() {
    for (const [id, degree] of this.indegree.entries()) {
      if (degree === 0) {
        this.setStatus(id, "ready");
        this.state.readyQueue.push(id);
      }
    }
  }

  private releaseDependents(nodeId: string) {
    const dependents = this.reverseDeps.get(nodeId) || [];
    for (const dependentId of dependents) {
      const dependent = this.dag.nodes[dependentId];
      if (!dependent || dependent.status === "blocked" || dependent.status === "failed") {
        continue;
      }

      const unresolved = dependent.dependsOn.some((depId) => this.dag.nodes[depId]?.status !== "succeeded");
      if (!unresolved && dependent.status === "pending") {
        this.setStatus(dependentId, "ready");
        this.state.readyQueue.push(dependentId);
      }
    }
  }

  private blockDescendants(nodeId: string) {
    const queue = [...(this.reverseDeps.get(nodeId) || [])];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this.dag.nodes[current];
      if (!node) continue;

      if (node.status === "succeeded" || node.status === "failed" || node.status === "blocked") {
        continue;
      }

      this.setStatus(current, "blocked");
      if (!this.state.blocked.includes(current)) {
        this.state.blocked.push(current);
      }

      this.state.readyQueue = this.state.readyQueue.filter((id) => id !== current);
      this.state.running = this.state.running.filter((id) => id !== current);

      const next = this.reverseDeps.get(current) || [];
      queue.push(...next);
    }
  }

  private setStatus(id: string, status: SubtaskStatus) {
    const node = this.dag.nodes[id];
    if (!node) return;
    node.status = status;
  }

  private computeDone(): boolean {
    return (
      this.state.readyQueue.length === 0 &&
      this.state.running.length === 0 &&
      Object.values(this.dag.nodes).every((node) =>
        ["succeeded", "failed", "blocked", "cancelled"].includes(node.status),
      )
    );
  }
}
