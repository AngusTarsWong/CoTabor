/**
 * Live test: find recent Zhihu articles for the logged-in user.
 * Connects to Chrome on port 9222, runs the agent, streams logs.
 */
import "dotenv/config";
import "fake-indexeddb/auto";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { setStorageAdapter, NodeStorageAdapter } from "../../../src/runner/storage-adapter";
setStorageAdapter(new NodeStorageAdapter());

import { bootstrapNode } from "../../../src/runner/bootstrap-node";
import { createSyncBackend } from "../../../src/memory/sync/backend-factory";

describe("Live: Zhihu recent articles", { timeout: 300000 }, () => {
  before(async () => {
    // Pull memories from Notion into local fake-indexeddb so the agent can use them.
    try {
      const syncWorker = await createSyncBackend();
      if (syncWorker) {
        console.log("[test:setup] Pulling memories from Notion...");
        const count = await syncWorker.pullCloudToEdge(0);
        console.log(`[test:setup] Pulled ${count} memory items from Notion.`);
      } else {
        console.warn("[test:setup] No sync backend — agent will run without cloud memories.");
      }
    } catch (e) {
      console.warn("[test:setup] Memory pull failed (non-critical):", e);
    }
  });

  it("should find and return recent article titles from Zhihu profile", async () => {
    const runtime = await bootstrapNode({ debugPort: 9222 });

    let finalResult: any = null;
    let finalError: any = null;

    await new Promise<void>((resolve) => {
      const agent = runtime.createAgent({
        goal: "帮我看看我知乎上最近发布的文章的标题",

        onLog: (msg) => console.log(`[log] ${msg}`),

        onStep: (step) => {
          const node = (step as any).node || "unknown";
          const update = (step as any).update || {};
          const action = update?.planner_output?.action;
          const watchdog = update?.watchdog_output;
          const debugPayloads = update?.debug_payloads || [];

          if (action) {
            console.log(`\n[step:${node}] type=${action.type} skill=${action.skill_name || ""} intent=${action.intent || ""}`);
            if (action.requires_human) {
              console.log(`  ⚠️  requires_human: ${action.human_type} — ${action.human_message}`);
            }
          }
          if (watchdog) {
            console.log(`[watchdog] ${watchdog.status} — ${watchdog.reason}`);
          }

          // Print executor action breakdown
          for (const dp of debugPayloads) {
            if (dp.title === "执行器动作分解") {
              console.log(`[grounding] steps: ${JSON.stringify(dp.output?.steps)}`);
            }
            if (dp.title === "执行节点输入输出") {
              console.log(`[executor] success=${dp.output?.executionResult?.success} url=${dp.output?.latestUrl}`);
            }
          }
        },

        onFinish: async (result) => {
          console.log("\n--- Agent Finished ---");
          finalResult = result;
          const output = result?.output ?? result?.planner_output?.action?.result ?? JSON.stringify(result, null, 2);
          console.log(output);
          await runtime.cleanup();
          resolve();
        },

        onError: async (err) => {
          console.error("--- Agent Error ---", err);
          finalError = err;
          await runtime.cleanup();
          resolve();
        },
      });

      agent.start().catch((err) => {
        finalError = err;
        resolve();
      });
    });

    if (finalError) throw finalError;
    assert.ok(finalResult, "Agent should produce a result");
  });
});
