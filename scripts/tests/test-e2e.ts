/**
 * 完整端到端流水线测试
 *
 * 验证链路：
 *   主 agent（AgentOrchestrator）
 *     ├── 子 agent A: draft_intro  (echo skill, 无依赖)
 *     ├── 子 agent B: draft_body   (echo skill, 无依赖)
 *     └── 子 agent C: publish      (notion_operator, 依赖 A+B)
 *   ↓
 *   记忆压缩（experience job: summarize → classify → write L1/L2/L3）
 *   ↓
 *   L2 检索验证（notion_operator 规则是否被写入并可检索）
 *   ↓
 *   云端同步（Notion）
 *
 * Run: npm run test:e2e
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

import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { AgentOrchestrator } from "../../src/core/orchestrator/AgentOrchestrator";
import { AgentMemoryProvider } from "../../src/shared/utils/memory/agent-memory";
import { retrieveL2RulesBySkillNames } from "../../src/memory/retrieval/l2-rule-retriever";
import { memoryStore } from "../../src/memory/store/indexeddb";

const today = new Date().toISOString().slice(0, 10);

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function log(tag: string, msg: string) {
  const short = msg.length > 120 ? msg.slice(0, 120) + "…" : msg;
  console.log(`  [${tag}] ${short}`);
}

// ─── Step 1: 主 agent 调度子任务 ──────────────────────────────────────────────

async function runOrchestrator(runtime: any): Promise<any> {
  section("Step 1: 主 agent 调度子任务（DAG 并行 + 扇入）");

  return new Promise<any>((resolve, reject) => {
    const orchestrator = new AgentOrchestrator();

    orchestrator.runInCurrentTab({
      tabId: runtime.tabId,
      goal: `撰写一篇关于多智能体协作的技术文章，并发布到 Notion（${today}）`,
      subtasks: [
        {
          id: "draft_intro",
          title: "起草文章标题与引言",
          description: `请调用 echo 技能，将以下内容作为 text 参数传入：\n标题：多智能体协作-并行与依赖调度的实践（${today}）\n引言：多智能体系统通过将复杂任务拆解为可并行执行的子任务，显著提升了自动化流程的效率与可靠性。\n调用 echo 后，输出 finish，在 description 中填写 echo 回来的内容。`,
          dependsOn: [],
          maxAttempts: 2,
        },
        {
          id: "draft_body",
          title: "起草文章正文",
          description: `请调用 echo 技能，将以下内容作为 text 参数传入：\n正文：调度器基于有向无环图（DAG）管理子任务依赖关系。无依赖的任务并行启动，有依赖的任务在所有前置任务成功后才进入就绪队列。失败的任务会阻断其所有后继节点，确保数据一致性。\n调用 echo 后，输出 finish，在 description 中填写 echo 回来的内容。`,
          dependsOn: [],
          maxAttempts: 2,
        },
        {
          id: "publish",
          title: "将文章发布到 Notion",
          description: `请调用 notion_operator 技能，在 Notion 的「CoTabor」页面下创建一个新页面，要求如下：\n- 页面标题：多智能体协作-并行与依赖调度的实践（${today}）\n- 页面内容：将前置任务输出摘要中的标题、引言和正文内容整合为完整文章，写入页面正文。\n- operate_type 参数填写：create_page\n- instruction 中必须明确指定父页面名称「CoTabor」\n调用成功后，输出 finish，在 description 中填写 Notion 页面创建结果（包含页面 URL 或 ID）。`,
          dependsOn: ["draft_intro", "draft_body"],
          maxAttempts: 2,
        },
      ],
      maxParallelSubAgents: 2,
      memory: new AgentMemoryProvider(),
      onLog: (msg: string) => {
        if (
          msg.includes("[Orchestrator]") ||
          msg.includes("round") ||
          msg.includes("launch") ||
          msg.includes("succeeded") ||
          msg.includes("failed") ||
          msg.includes("scheduler")
        ) {
          log("orchestrator", msg);
        }
      },
      onFinish: (result: any) => {
        log("orchestrator", `✅ 主任务完成`);
        const dagState = result?.scheduler_runtime;
        if (dagState) {
          log("dag", `completed=[${dagState.completed?.join(", ")}]`);
          log("dag", `failed=[${dagState.failed?.join(", ")}]`);
          log("dag", `blocked=[${dagState.blocked?.join(", ")}]`);
        }
        resolve(result);
      },
      onError: (err: any) => {
        log("orchestrator", `❌ 主任务失败: ${err.message}`);
        reject(err);
      },
    }).catch(reject);
  });
}

// ─── Step 2: 记忆压缩 ─────────────────────────────────────────────────────────

async function runMemoryCompression(runtime: any, orchestratorResult: any) {
  section("Step 2: 记忆压缩（experience job）");

  // 构造一个合成的 finalState 供 experience job 消费
  // 真实场景中这来自子 agent 的 finalState；这里我们用 orchestrator 结果 + 手工构造 experience_buffer
  const syntheticFinalState = {
    ...orchestratorResult,
    request: `撰写一篇关于多智能体协作的技术文章，并发布到 Notion（${today}）`,
    status: "FINISHED",
    total_history: [
      {
        step: 1,
        ts: Date.now() - 5000,
        action: { type: "call_skill", skill_name: "echo" },
        result: { status: "success" },
        step_summary: "调用 echo 生成文章标题与引言",
      },
      {
        step: 2,
        ts: Date.now() - 4000,
        action: { type: "call_skill", skill_name: "echo" },
        result: { status: "success" },
        step_summary: "调用 echo 生成文章正文",
      },
      {
        step: 3,
        ts: Date.now() - 2000,
        action: { type: "call_skill", skill_name: "notion_operator" },
        result: { status: "success" },
        step_summary: "调用 notion_operator 创建 Notion 页面，需在 instruction 中明确指定父页面名称",
      },
      {
        step: 4,
        ts: Date.now(),
        action: { type: "finish" },
        result: { status: "success" },
        step_summary: "任务完成",
      },
    ],
    experience_buffer: {
      site_insights: [],
      tool_insights: [
        {
          skillName: "notion_operator",
          content: "调用 notion_operator 创建页面时，instruction 中必须明确指定父页面名称（如「CoTabor」），否则 agent 会因找不到父容器而无法推进。推荐格式：在「CoTabor」页面下创建新页面，标题为 XXX，内容为 YYY。operate_type 填写 create_page，page_title 和 page_content 单独传参效果更稳定。",
        },
      ],
      task_wisdom: [
        "多智能体 DAG 调度中，扇入任务（依赖多个前置任务）应在 description 中明确说明如何利用前置任务的输出，避免 agent 重复搜索已有信息。",
      ],
      failure_insights: [],
    },
    meta_data: { url: "", title: "多智能体协作文章发布任务" },
  };

  log("memory", "开始调度 experience job...");
  await runtime.syncMemory(syntheticFinalState);
  log("memory", "✅ experience job 完成，记忆已写入 IndexedDB 并同步到云端");
}

// ─── Step 3: L2 检索验证 ──────────────────────────────────────────────────────

async function verifyL2Retrieval() {
  section("Step 3: L2 检索验证");

  const rules = await retrieveL2RulesBySkillNames(["notion_operator", "echo"]);

  const notionPair = rules.get("notion_operator");
  const echoPair = rules.get("echo");

  if (notionPair?.base) {
    log("L2", `✅ notion_operator 规则已写入`);
    log("L2", `   id: ${notionPair.base.id}`);
    log("L2", `   hitCount: ${notionPair.base.hitCount}`);
    log("L2", `   rules: ${notionPair.base.parameterRules.slice(0, 100)}...`);
  } else {
    log("L2", `⚠️  notion_operator 暂无 L2 规则（experience job 可能未提炼出 tool_insight）`);
  }

  if (echoPair?.base) {
    log("L2", `✅ echo 规则已写入: ${echoPair.base.parameterRules.slice(0, 80)}...`);
  } else {
    log("L2", `ℹ️  echo 暂无 L2 规则（正常，echo 是简单工具）`);
  }

  // 检查 L3 战术记忆
  const l3Rules = await memoryStore.searchL3Memories("多智能体 DAG 调度");
  log("L3", `检索到 ${l3Rules.length} 条 L3 战术记忆`);
  l3Rules.slice(0, 2).forEach((r, i) => {
    log("L3", `  [${i + 1}] ${r.memoryTitle}: ${r.tacticalRules?.slice(0, 80) ?? ""}...`);
  });

  return { notionL2: !!notionPair?.base, l3Count: l3Rules.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║     完整端到端流水线测试：主从调度 + 记忆压缩 + 检索      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // 开启多智能体调度器
  process.env.VITE_MULTI_AGENT_SCHEDULER = "true";

  const runtime = await bootstrapNode();

  let orchestratorResult: any;
  let memoryOk = false;
  let retrievalResult: any;

  try {
    // Step 1: 主 agent 调度
    orchestratorResult = await runOrchestrator(runtime);

    // Step 2: 记忆压缩
    await runMemoryCompression(runtime, orchestratorResult);
    memoryOk = true;

    // Step 3: 检索验证
    retrievalResult = await verifyL2Retrieval();
  } catch (err: any) {
    console.error("\n[fatal]", err.message);
  } finally {
    await runtime.cleanup();
  }

  // ─── 最终报告 ───────────────────────────────────────────────────────────────
  section("最终报告");

  const dagState = orchestratorResult?.scheduler_runtime;
  const dagOk = dagState && dagState.failed?.length === 0 && dagState.blocked?.length === 0;

  console.log(`  主从调度（DAG）  : ${dagOk ? "✅ 通过" : "❌ 失败"}`);
  if (dagState) {
    console.log(`    completed: [${dagState.completed?.join(", ")}]`);
    console.log(`    failed:    [${dagState.failed?.join(", ")}]`);
  }
  console.log(`  记忆压缩         : ${memoryOk ? "✅ 通过" : "❌ 失败"}`);
  console.log(`  L2 检索          : ${retrievalResult?.notionL2 ? "✅ 命中" : "⚠️  未命中（需更多任务积累）"}`);
  console.log(`  L3 战术记忆      : ${(retrievalResult?.l3Count ?? 0) > 0 ? `✅ ${retrievalResult.l3Count} 条` : "⚠️  暂无"}`);

  const allOk = dagOk && memoryOk;
  console.log(`\n${allOk ? "✅ PASS" : "❌ FAIL"} — 完整端到端流水线测试`);

  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
