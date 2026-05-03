import "dotenv/config";
import "fake-indexeddb/auto";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = "http://127.0.0.1:6789";
  process.env.HTTP_PROXY = "http://127.0.0.1:6789";
}

import { memoryProvider } from "../../../src/memory/store/memory-provider";
import { retrieveL2RulesBySkillNames } from "../../../src/memory/retrieval/l2-rule-retriever";
import { enrichSkillsWithL2Memory } from "../../../src/memory/retrieval/enrich-skills";
import { runSubAgentTask } from "../../../src/core/orchestrator/runtime/SubAgentRunner";
import { withTestRunner } from "../runners/base-runner";
import type { SubtaskNode } from "../../../src/core/orchestrator/types/SubtaskDag";
import type { MemoryItem, L2RuleMeta } from "../../../src/shared/types/memory";

import { LLMMocker } from "../mocks/llm";

const today = new Date().toISOString().slice(0, 10);

describe("Integration: Memory Retrieval & Usage (Mocked)", { timeout: 60000 }, () => {
  it("should seed memory, retrieve it, and use it correctly in an agent run", async () => {
    const mocker = new LLMMocker();
    
    // First planner call: call notion_operator
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: `\`\`\`json
{
  "type": "call_skill",
  "skill_name": "notion_operator",
  "params": { "instruction": "Mocking Notion call" },
  "description": "Mock calling notion_operator",
  "task_list": []
}
\`\`\``
    });

    // Second planner call: finish
    mocker.addRule({
      nodeMatch: "planner",
      times: 1,
      response: `\`\`\`json
{
  "type": "finish",
  "description": "Task is mock finished",
  "task_list": []
}
\`\`\``
    });

    try {
      await withTestRunner("memory-retrieval-loop", async (runner, runtime) => {
        runner.logEvent("phase", "Step 1: Seed memory");
        const rule: MemoryItem = {
          id: `skl_test_notion_${Date.now()}`,
          type: "L2_RULE",
          title: "Mock Notion Rule",
          content: "Call notion_operator correctly with parent page.",
          tags: ["skill:notion_operator", "rule_scope:base"],
          meta: {
            skillName: "notion_operator",
            ruleType: "param_format",
            ruleScope: "base",
            parameterRules: "【必须】调用 notion_operator 创建页面时，instruction 中必须明确指定父页面名称或 ID...",
            hitCount: 1,
            status: "active",
          } as L2RuleMeta,
          stability: 1.0,
          lastAccessedAt: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await memoryProvider.save(rule);
        runner.logEvent("seed", `Rule seeded: ${rule.id}`);

        runner.logEvent("phase", "Step 2: Verify Retrieval");
        const rules = await retrieveL2RulesBySkillNames(["notion_operator"]);
        const pair = rules.get("notion_operator");
        assert.ok(pair?.base, "Should retrieve L2 rule");

        const mockSkill = {
          name: "notion_operator",
          description: "处理所有与 Notion 相关的文档操作。",
          role: "action" as const,
          type: "local" as const,
          params: { instruction: "string" },
          execute: async () => ({ success: true, message: "Mock notion execution" }),
          getManual: async () => "",
        };

        const enriched = await enrichSkillsWithL2Memory([mockSkill]);
        assert.ok(enriched[0].description.includes("[L2 Memory Rules]"), "Description should contain injected rules");
        runner.logEvent("retrieval", "L2 memory retrieval and injection verified");

        // Register the mock skill to override the real one
        const { skillRegistry } = await import("../../../src/skills/registry");
        skillRegistry.register(enriched[0]);

        runner.logEvent("phase", "Step 3: Execution");
        const node: SubtaskNode = {
          id: "publish_to_notion",
          title: "将文章发布到 Notion",
          description: `请调用 notion_operator 技能，在 Notion 中创建一个新页面...\n要求页面标题为：测试标题\n内容为：测试正文。\noperate_type: create_page`,
          dependsOn: [],
          status: "ready",
          attempt: 0,
          maxAttempts: 2,
        };

        const result = await runSubAgentTask(node, (_n: SubtaskNode) => ({
          tabId: runtime.tabId,
          goal: _n.description ?? _n.title,
          onLog: (msg: string) => {
            if (msg.includes("[L2 Memory Rules]")) runner.logEvent("injection", msg);
          },
          onStep: (step: any) => {
            const action = step.state?.planner_output?.action;
            if (step.node === "planner" && action) {
              runner.logEvent("step", `${action.type}(${action.skill_name || ""})`);
            }
          },
        }));

        assert.ok(result.success, "Agent task executed successfully with mocks");
        runner.logEvent("result", "Success via Mocks");
      }, { headless: true });
    } finally {
      mocker.destroy();
    }
  });
});
