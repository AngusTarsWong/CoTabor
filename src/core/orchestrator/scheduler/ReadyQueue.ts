import { DependencyScheduler } from "./DependencyScheduler";

export function nextLaunchBatch(scheduler: DependencyScheduler, maxParallel: number): string[] {
  const decision = scheduler.decide(maxParallel);
  return decision.launch;
}
