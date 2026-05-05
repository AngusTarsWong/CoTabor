import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTestRunner } from "../runners/base-runner";
import { loadBuiltInMcpSkills } from "../../../src/skills/bundled/mcp-builtin";
import { skillRegistry } from "../../../src/skills/registry";

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const { setGlobalDispatcher, ProxyAgent } = require("undici");
  setGlobalDispatcher(new ProxyAgent(proxy));
}

describe("Live Smoke: Wikipedia MCP Research (No Sync)", { timeout: 180000 }, () => {
  it("should finish a real Wikipedia research task without syncing memories", async () => {
    await withTestRunner("wikipedia-mcp-smoke", async (runner, runtime) => {
      const mcpSkills = await loadBuiltInMcpSkills();
      for (const skill of mcpSkills) {
        skillRegistry.register(skill);
      }

      runner.logEvent("info", "Registered built-in MCP skills for smoke test");

      const goal = [
        "请完成以下信息调研任务，全程无需使用浏览器访问网页，请直接调用你的 MCP 工具：",
        "1) 调用 `search_wikipedia` 工具，搜索关于 \"United States\" 的词条。",
        "2) 从搜索结果中找到最匹配的英文词条标题。",
        "3) 调用 `get_wikipedia_summary` 工具，获取该词条摘要。",
        "4) 用中文输出一份不少于 200 字的总结。",
        "5) 任务完成后输出 finish，并在 description 中给出中文总结。",
      ].join("\n");

      const stepRecords: Array<{
        node: string;
        actionType?: string;
        skillName?: string;
        watchdogStatus?: string;
        watchdogReason?: string;
      }> = [];

      const agent = runtime.createAgent({
        goal,
        onLog: (msg) => runner.logEvent("agent_log", msg),
        onStep: (step) => {
          const node = (step as any).node || "unknown";
          const update = (step as any).update || {};
          const action = update?.planner_output?.action;
          const watchdog = update?.watchdog_output;

          stepRecords.push({
            node,
            actionType: action?.type,
            skillName: action?.skill_name,
            watchdogStatus: watchdog?.status,
            watchdogReason: watchdog?.reason,
          });

          if (action) {
            runner.logEvent("step", `${node}: ${action.type}(${action.skill_name || ""}) — ${action.description || ""}`);
          }
          if (watchdog) {
            runner.logEvent("watchdog", `${watchdog.status} — ${watchdog.reason || ""}`);
          }
        },
      });

      const result = await agent.start();
      runner.logEvent("result", JSON.stringify(result));

      assert.equal(result.status, "FINISHED", "Agent should finish successfully");
      const action = result?.planner_output?.action;
      const finalSummaryCandidates = [
        typeof action?.result === "string" ? action.result : "",
        typeof action?.description === "string" ? action.description : "",
      ].filter(Boolean);
      const finalSummary = finalSummaryCandidates.sort((a, b) => b.length - a.length)[0] || "";
      assert.ok(finalSummary.length >= 100, "Final summary should contain meaningful content");
      assert.ok(
        stepRecords.some((step) => step.actionType === "call_skill" && step.skillName === "search_wikipedia"),
        "Planner should call search_wikipedia during the task",
      );
      assert.ok(
        stepRecords.some((step) => step.actionType === "call_skill" && step.skillName === "get_wikipedia_summary"),
        "Planner should call get_wikipedia_summary during the task",
      );
      assert.ok(
        stepRecords.some((step) => step.node === "watchdog" && step.watchdogStatus === "PASS"),
        "Watchdog should audit at least one step successfully",
      );
    }, { headless: true });
  });
});
