/**
 * 记忆检索能力验证测试
 *
 * 流程：
 * 1. 写入 notion_operator 的 L2 失败经验（模拟上次 publish_to_notion 任务的问题）
 * 2. 检索验证：确认能从 IndexedDB 取出该经验
 * 3. 带记忆重跑 publish_to_notion 任务，观察 agent 是否利用了 L2 规则
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

// ─── Step 1: 写入 L2 失败经验 ────────────────────────────────────────────────

async function seedL2Memory() {
  console.log("\n=== Step 1: 写入 notion_operator L2 失败经验 ===\n");

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
  console.log(`✅ 已写入 L2 规则: ${rule.id}`);
  console.log(`   skillName    : ${rule.skillName}`);
  console.log(`   parameterRules:\n${rule.parameterRules.split("\n").map(l => "     " + l).join("\n")}`);
  console.log(`   errorHistory : ${rule.errorHistory}`);
  return rule.id;
}

// ─── Step 2: 检索验证 ─────────────────────────────────────────────────────────

async function verifyRetrieval() {
  console.log("\n=== Step 2: 检索验证 ===\n");

  const rules = await retrieveL2RulesBySkillNames(["notion_operator"]);
  const pair = rules.get("notion_operator");

  if (!pair?.base) {
    console.error("❌ 检索失败：未找到 notion_operator 的 L2 规则");
    return false;
  }

  console.log("✅ 检索成功，找到 L2 规则：");
  console.log(`   id          : ${pair.base.id}`);
  console.log(`   hitCount    : ${pair.base.hitCount}`);
  console.log(`   parameterRules (前100字): ${pair.base.parameterRules.slice(0, 100)}...`);

  // 验证 enrichSkillsWithL2Memory 能把规则注入到 skill description
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
  console.log(`\n✅ enrichSkillsWithL2Memory 注入结果:`);
  console.log(`   包含 [L2 Memory Rules]: ${hasL2}`);
  if (hasL2) {
    const injected = enriched[0].description.split("[L2 Memory Rules]")[1];
    console.log(`   注入内容 (前150字): ${injected.slice(0, 150)}...`);
  }

  return hasL2;
}

// ─── Step 3: 带记忆重跑任务 ───────────────────────────────────────────────────

async function rerunWithMemory(runtime: any) {
  console.log("\n=== Step 3: 带 L2 记忆重跑 publish_to_notion 任务 ===\n");
  console.log("（观察 agent 是否利用了 L2 规则，正确指定父页面）\n");

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
        console.log(`  [L2注入] ${msg.slice(0, 200)}`);
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

  console.log(`\n结果: ${result.success ? "✅ 成功" : "❌ 失败"}`);
  if (result.success) {
    const desc = result.finalState?.planner_output?.action?.description ?? "";
    console.log(`描述: ${desc.slice(0, 200)}`);
  } else {
    console.log(`错误: ${result.error?.message}`);
  }

  // 检查 agent 是否在 notion_operator 调用中指定了父页面
  const notionCalls = plannerDecisions.filter(d => d.includes("notion_operator"));
  console.log(`\nntion_operator 调用次数: ${notionCalls.length}`);
  notionCalls.forEach((c, i) => console.log(`  [${i + 1}] ${c.slice(0, 150)}`));

  return result.success;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== 记忆检索能力验证 ===");

  await seedL2Memory();
  const retrievalOk = await verifyRetrieval();

  if (!retrievalOk) {
    console.error("\n❌ 检索验证失败，终止测试");
    process.exit(1);
  }

  const runtime = await bootstrapNode();
  const taskOk = await rerunWithMemory(runtime);
  await runtime.cleanup();

  console.log("\n=== 测试总结 ===");
  console.log(`  L2 写入 & 检索 : ✅`);
  console.log(`  L2 注入 skill  : ✅`);
  console.log(`  任务执行结果   : ${taskOk ? "✅ 成功" : "⚠️  失败（但记忆链路已验证）"}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
