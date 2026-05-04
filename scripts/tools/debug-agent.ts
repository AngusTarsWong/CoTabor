/**
 * Interactive debug runner: connects to (or launches) Chrome, then runs a
 * one-shot Agent task and streams step logs to the console.
 *
 * Usage: npx tsx scripts/tools/debug-agent.ts
 *        npm run tool:debug
 */
import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { formatStepLog } from "../../src/shared/utils/logger";

const runtime = await bootstrapNode({
  debugPort: 9222,
});

const agent = runtime.createAgent({
  goal: "帮我看看我知乎上最近发布的文章的标题",

  onLog: (msg) => console.log(`[log] ${msg}`),

  onStep: (step) => {
    const { hasImportantInfo, logText } = formatStepLog(step);
    if (hasImportantInfo) {
      console.log(logText);
    }
  },

  onFinish: async (result) => {
    console.log("\n--- Agent Finished ---");
    console.log(result?.output ?? JSON.stringify(result, null, 2));
    await runtime.syncMemory(result?.finalState ?? result);
    await runtime.cleanup();
    process.exit(0);
  },

  onError: async (err) => {
    console.error("--- Agent Error ---", err);
    await runtime.cleanup();
    process.exit(1);
  },
});

await agent.start();
