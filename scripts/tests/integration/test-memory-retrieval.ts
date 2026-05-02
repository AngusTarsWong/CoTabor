/**
 * Memory retrieval capability test.
 *
 * Flow:
 * 1. Seed an L2 failure rule for `notion_operator`
 * 2. Verify retrieval from IndexedDB
 * 3. Re-run a publish task and observe whether the agent uses the L2 rule
 *
 * Run: npm run test:memory-retrieval
 */
import "dotenv/config";
import "fake-indexeddb/auto";

if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  process.env.HTTPS_PROXY = "http://127.0.0.1:6789";
  process.env.HTTP_PROXY = "http://127.0.0.1:6789";
}

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { memoryStore } from "../../src/memory/store/indexeddb";
import { retrieveL2RulesBySkillNames } from "../../src/memory/retrieval/l2-rule-retriever";
import { enrichSkillsWithL2Memory } from "../../src/memory/retrieval/enrich-skills";
import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { runSubAgentTask } from "../../src/core/orchestrator/runtime/SubAgentRunner";
import type { SubtaskNode } from "../../src/core/orchestrator/types/SubtaskDag";
import type { L2SkillMemory } from "../../src/shared/types/memory";

const today = new Date().toISOString().slice(0, 10);

// ─── Step 1: Seed L2 failure memory ──────────────────────────────────────────

async function seedL2Memory() {
  console.log("\n=== Step 1: Seed notion_operator L2 failure memory ===\n");

  const rule: L2SkillMemory = {
    id: `skl_test_notion_${Date.now()}`,
    skillName: "notion_operator",
    ruleType: "param_format",
    ruleScope: "base",
    parameterRules: [
      "【必须】调用 notion_operator 创建页面时，instruction 中必须明确指定父页面名称或 ID，否则 Notion API 会因找不到父容器而失败。",
      "【推荐格式】instruction: '在「CoTabor」页面下创建新页面，标题为 XXX，内容为 YYY'",
      "【错误示例】instruction 中只写标题和内容，不指定父页面 → 导致 search 找不到合适位置，任务无法推进。",
      "【operate_type】创建页面时填写 create_page，page_title 和 page_content 单独传参效果更稳定。",
    ].join("\n"),
    errorHistory: "2026-04-27: publish_to_notion 子任务调用 notion_operator 时未指定父页面，agent 执行 search 后仍无法确定写入位置，最终 finish 时报告「需要补充父页面信息」。",
    hitCount: 1,
    successCount: 0,
    status: "active",
    updatedAt: Date.now(),
  };

  await memoryStore.putL2Rule(rule);
  console.log(`✅ Seeded L2 rule: ${rule.id}`);
  console.log(`   skillName    : ${rule.skillName}`);
  console.log(`   parameterRules:\n${rule.parameterRules.split("\n").map(l => "     " + l).join("\n")}`);
  console.log(`   errorHistory : ${rule.errorHistory}`);
  return rule.id;
}

// ─── Step 2: Verify retrieval ────────────────────────────────────────────────

async function verifyRetrieval() {
  console.log("\n=== Step 2: Verify retrieval ===\n");

  const rules = await retrieveL2RulesBySkillNames(["notion_operator"]);
  const pair = rules.get("notion_operator");

  if (!pair?.base) {
    console.error("❌ Retrieval failed: no L2 rule found for notion_operator");
    return false;
  }

  console.log("✅ Retrieval succeeded. Found L2 rule:");
  console.log(`   id          : ${pair.base.id}`);
  console.log(`   hitCount    : ${pair.base.hitCount}`);
  console.log(`   parameterRules (first 100 chars): ${pair.base.parameterRules.slice(0, 100)}...`);

  // Verify that `enrichSkillsWithL2Memory` injects the rule into the skill description.
  const mockSkill = {
    name: "notion_operator",
    description: "处理所有与 Notion 相关的文档操作。",
    role: "action" as const,
    type: "local" as const,
    params: { instruction: "string" },
    execute: async () => ({}),
  };

  const enriched = await enrichSkillsWithL2Memory([mockSkill]);
  const hasL2 = enriched[0].description.includes("[L2 Memory Rules]");
  console.log(`\n✅ enrichSkillsWithL2Memory result:`);
  console.log(`   Contains [L2 Memory Rules]: ${hasL2}`);
  if (hasL2) {
    const injected = enriched[0].description.split("[L2 Memory Rules]")[1];
    console.log(`   Injected content (first 150 chars): ${injected.slice(0, 150)}...`);
  }

  return hasL2;
}

// ─── Step 3: Re-run with memory ──────────────────────────────────────────────

async function rerunWithMemory(runtime: any) {
  console.log("\n=== Step 3: Re-run publish_to_notion with L2 memory ===\n");
  console.log("(Observe whether the agent uses the L2 rule to specify the parent page correctly)\n");

  const node: SubtaskNode = {
    id: "publish_to_notion",
    title: "将文章发布到 Notion",
    description: [
      `请调用 notion_operator 技能，在 Notion 中创建一个新页面，要求如下：`,
      `- 页面标题：多智能体协作-并行与依赖调度的实践（${today}）`,
      `- 页面内容：多智能体系统通过将复杂任务拆解为可并行执行的子任务，显著提升了自动化流程的效率与可靠性。调度器基于有向无环图（DAG）管理子任务依赖关系，无依赖的任务并行启动，有依赖的任务在所有前置任务成功后才进入就绪队列。`,
      `- operate_type 参数填写：create_page`,
      `调用成功后，输出 finish，在 description 中填写 Notion 页面创建结果（包含页面 URL 或 ID）。`,
    ].join("\n"),
    dependsOn: [],
    status: "ready",
    attempt: 0,
    maxAttempts: 2,
  };

  let plannerDecisions: string[] = [];

  const result = await runSubAgentTask(node, (_n: SubtaskNode) => ({
    tabId: runtime.tabId,
    onLog: (msg: string) => {
      if (msg.includes("[L2 Memory Rules]")) {
        console.log(`  [L2 injection] ${msg.slice(0, 200)}`);
      }
    },
    onStep: (step: any) => {
      const action = step.state?.planner_output?.action;
      if (step.node === "planner" && action) {
        const decision = `${action.type}${action.skill_name ? `(${action.skill_name})` : ""}: ${action.description ?? ""}`;
        plannerDecisions.push(decision);
        console.log(`  [planner] ${decision.slice(0, 120)}`);
      }
    },
  }));

  console.log(`\nResult: ${result.success ? "✅ Success" : "❌ Failed"}`);
  if (result.success) {
    const desc = result.finalState?.planner_output?.action?.description ?? "";
    console.log(`Description: ${desc.slice(0, 200)}`);
  } else {
    console.log(`Error: ${result.error?.message}`);
  }

  // Check whether the agent specified a parent page in notion_operator calls.
  const notionCalls = plannerDecisions.filter(d => d.includes("notion_operator"));
  console.log(`\nnotion_operator call count: ${notionCalls.length}`);
  notionCalls.forEach((c, i) => console.log(`  [${i + 1}] ${c.slice(0, 150)}`));

  return result.success;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Memory Retrieval Capability Test ===");

  await seedL2Memory();
  const retrievalOk = await verifyRetrieval();

  if (!retrievalOk) {
    console.error("\n❌ Retrieval verification failed. Aborting test.");
    process.exit(1);
  }

  const runtime = await bootstrapNode();
  const taskOk = await rerunWithMemory(runtime);
  await runtime.cleanup();

  console.log("\n=== Summary ===");
  console.log(`  L2 write & retrieval : ✅`);
  console.log(`  L2 skill injection   : ✅`);
  console.log(`  Task execution       : ${taskOk ? "✅ Success" : "⚠️  Failed (memory path still verified)"}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
