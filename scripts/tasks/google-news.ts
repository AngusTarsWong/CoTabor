import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { googleNewsToNotion } from "../../src/tasks/google-news-to-notion";

const params = Object.fromEntries(
  process.argv.slice(2).map((arg) => arg.split("=") as [string, string])
);

const runtime = await bootstrapNode();

const agent = runtime.createAgent({
  goal: googleNewsToNotion.buildGoal(params),
  onLog: (msg) => console.log(`[log] ${msg}`),
  onStep: (step) => {
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
