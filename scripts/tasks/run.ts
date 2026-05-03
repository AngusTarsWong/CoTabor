/**
 * Generic task runner.
 * Usage: npx tsx scripts/tasks/run.ts <task-id> [key=value ...]
 * Example: npx tsx scripts/tasks/run.ts google-news-to-notion topic=AI
 */
import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { taskRegistry } from "../../src/tasks/registry";

const [taskId, ...rawParams] = process.argv.slice(2);

if (!taskId) {
  const ids = taskRegistry.list().map((t) => `  ${t.id}  —  ${t.name}`).join("\n");
  console.error(`Usage: npx tsx scripts/tasks/run.ts <task-id> [key=value ...]\n\nAvailable tasks:\n${ids}`);
  process.exit(1);
}

const task = taskRegistry.get(taskId);
if (!task) {
  console.error(`Unknown task: "${taskId}". Run without arguments to see available tasks.`);
  process.exit(1);
}

const params = Object.fromEntries(
  rawParams.map((arg) => arg.split("=") as [string, string])
);

console.log(`[run] Task: ${task.name}`);
const runtime = await bootstrapNode();

const agent = runtime.createAgent({
  goal: task.buildGoal({ ...task.defaultParams, ...params }),
  onStep: (step: any) => {
    const action = step.state?.planner_output?.action;
    if (step.node === "planner" && action) {
      console.log(`\n[step] ${action.type}${action.skill_name ? `(${action.skill_name})` : ""} — ${action.description ?? ""}`);
    }
  },
  onFinish: async (result) => {
    console.log("\n[done]", result?.output ?? JSON.stringify(result));
    await runtime.syncMemory(result?.finalState ?? result);
    await runtime.cleanup();
    process.exit(0);
  },
  onError: async (err) => {
    console.error("[error]", err);
    await runtime.cleanup();
    process.exit(1);
  },
});

await agent.start();
