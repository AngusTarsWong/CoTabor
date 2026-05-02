/**
 * End-to-end acceptance test.
 *
 * Coverage:
 *   1. Notion / LLM / sync-backend preflight checks
 *   2. Multi-agent DAG scheduling (`draft_intro` + `draft_body` -> `publish`)
 *   3. Real Notion publish with page URL / ID returned
 *   4. Experience job writes L1/L2/L3 and runs cloud sync
 *   5. L2 / L3 retrieval verification
 *
 * Run: npm run test:e2e
 */
import "dotenv/config";
import "fake-indexeddb/auto";
import fs from "fs";
import path from "path";

// Set proxy only if not already configured. Provide via HTTPS_PROXY env var in CI/CD.
// Example: HTTPS_PROXY=http://127.0.0.1:7890 npm run test:e2e
if (!process.env.HTTPS_PROXY && !process.env.https_proxy) {
  // No proxy configured; requests will go direct
}

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { NOTION_LOCAL_CONFIG_PATH, storageAdapter } from "../../src/runner/storage-adapter";
import { createSyncBackend } from "../../src/memory/sync/backend-factory";
import { runSubAgentTask } from "../../src/core/orchestrator/runtime/SubAgentRunner";
import { extractTaskGraphSummary, runTaskGraph } from "../../src/core/orchestrator/runtime/TaskGraphRunner";
import { retrieveL2RulesBySkillNames } from "../../src/memory/retrieval/l2-rule-retriever";
import { l3Bm25Index } from "../../src/memory/retrieval/l3-bm25-index";
import {
  extractNotionPageId,
  initializeNotionBrainBase,
  searchAccessibleNotionPages,
} from "../../src/skills/bundled/notion-operator/init";
import type { SubtaskNode } from "../../src/core/orchestrator/types/SubtaskDag";
import type { SchedulerRuntimeState } from "../../src/core/orchestrator/types/SchedulerState";
import type { MemorySyncReport } from "../../src/runner/types";

const today = new Date().toISOString().slice(0, 10);
const taskTitle = `多智能体协作-并行与依赖调度的实践（${today}）`;
const taskGoal = `撰写一篇关于多智能体协作的技术文章，并发布到 Notion（${today}）`;

type PreflightResult = {
  ok: boolean;
  storageBackend: "notion" | "feishu" | "unknown";
  syncBackendReady: boolean;
  parentPageId?: string;
  parentPageTitle?: string;
  issues: string[];
};

type SubtaskExecutionSnapshot = {
  success: boolean;
  summary: string;
  finalState?: any;
  error?: string;
};

type SchedulerFlowResult = {
  dagState: SchedulerRuntimeState;
  subtaskResults: Record<string, SubtaskExecutionSnapshot>;
  publishSummary: string;
  publishReferenceOk: boolean;
};

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function log(tag: string, msg: string) {
  const short = msg.length > 140 ? `${msg.slice(0, 140)}…` : msg;
  console.log(`  [${tag}] ${short}`);
}

function extractSummary(result: any): string {
  const candidates = [
    result?.planner_output?.action?.description,
    result?.planner_output?.action?.result,
    result?.output,
    result?.summary,
    result?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (result == null) return "";
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function hasNotionReference(text: string): boolean {
  if (!text) return false;
  const notionUrl = /https?:\/\/(?:www\.)?notion\.so\/\S+/i;
  const dashedId = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
  const compactId = /\b[0-9a-f]{32}\b/i;
  return notionUrl.test(text) || dashedId.test(text) || compactId.test(text);
}

async function runPreflight(): Promise<PreflightResult> {
  section("Step 0: Preflight");

  const issues: string[] = [];
  if (!process.env.LLM_API_KEY && !process.env.VITE_LLM_API_KEY) {
    issues.push("缺少 LLM_API_KEY / VITE_LLM_API_KEY");
  }
  if (!process.env.NOTION_API_KEY && !process.env.VITE_NOTION_API_KEY) {
    issues.push("缺少 NOTION_API_KEY / VITE_NOTION_API_KEY");
  }

  let stored = await storageAdapter.get([
    "storageBackend",
    "notionBackendConfig",
    "notionParentPageUrl",
    "notionApiKey",
  ]);

  let parentPageId = "";
  let parentPageTitle = "";

  if (stored.notionApiKey) {
    try {
      const apiKey = String(stored.notionApiKey);

      if (stored.notionParentPageUrl) {
        parentPageId = extractNotionPageId(String(stored.notionParentPageUrl));
        parentPageTitle = "CoTabor";
        log("preflight", "发现 notionParentPageUrl，开始自动初始化 Notion backend");
      } else {
        log("preflight", "未配置 notionParentPageUrl，尝试搜索父页面「CoTabor」");
        let pages = await searchAccessibleNotionPages(apiKey, "CoTabor");
        if (pages.length === 0) {
          log("preflight", "按名称未命中，继续拉取最近可访问页面做兜底匹配");
          pages = await searchAccessibleNotionPages(apiKey, "");
        }
        const matched =
          pages.find((page) => page.title.trim() === "CoTabor") ??
          pages.find((page) => page.title.includes("CoTabor")) ??
          pages[0];

        if (matched?.id) {
          parentPageId = matched.id;
          parentPageTitle = matched.title;
          log("preflight", `找到父页面：${matched.title} (${matched.id})`);
        } else {
          log("preflight", "未找到当前 Integration 可访问的父页面「CoTabor」");
        }
      }

      if (parentPageId) {
        const notionBackendConfig = await initializeNotionBrainBase({ apiKey, parentPageId });
        const configPath = path.resolve(process.cwd(), NOTION_LOCAL_CONFIG_PATH);
        fs.writeFileSync(configPath, JSON.stringify(notionBackendConfig, null, 2), "utf-8");
        log("preflight", `已自动写入 ${NOTION_LOCAL_CONFIG_PATH}`);
        stored = await storageAdapter.get([
          "storageBackend",
          "notionBackendConfig",
          "notionParentPageUrl",
          "notionApiKey",
        ]);
      }
    } catch (error: any) {
      log("preflight", `自动初始化 Notion backend 失败: ${error?.message || String(error)}`);
    }
  }

  const syncWorker = await createSyncBackend();
  const storageBackend: "notion" | "feishu" | "unknown" =
    stored.storageBackend === "notion" || stored.storageBackend === "feishu"
      ? stored.storageBackend
      : "unknown";

  log("env", `storageBackend=${storageBackend}`);
  log("env", `notionApiKey=${stored.notionApiKey ? "present" : "missing"}`);
  log("env", `notionParentPageUrl=${stored.notionParentPageUrl ? "present" : "missing"}`);
  log("env", `notionBackendConfig=${stored.notionBackendConfig ? "present" : "missing"}`);

  if (storageBackend !== "notion") {
    issues.push(`当前 storageBackend=${storageBackend}，未切到 notion`);
  }
  if (!stored.notionBackendConfig) {
    issues.push("notionBackendConfig 未初始化");
  }
  if (!syncWorker) {
    issues.push("createSyncBackend() 未返回可用的 SyncWorker");
  }

  if (issues.length === 0) {
    log("preflight", "✅ Notion/LLM/Sync backend 检查通过");
  } else {
    issues.forEach((issue) => log("preflight", `❌ ${issue}`));
  }

  return {
    ok: issues.length === 0,
    storageBackend,
    syncBackendReady: Boolean(syncWorker),
    parentPageId: parentPageId || undefined,
    parentPageTitle: parentPageTitle || undefined,
    issues,
  };
}

async function runSchedulerFlow(runtime: any, preflight: PreflightResult): Promise<SchedulerFlowResult> {
  section("Step 1: 主 agent 调度子任务（DAG 并行 + 扇入）");
  const parentPageId = preflight.parentPageId ?? "";
  const parentPageTitle = preflight.parentPageTitle ?? "CoTabor";
  const parentPageHint = parentPageId
    ? `父页面 ID 为「${parentPageId}」，如需 structured params，请填写 parent_type=page_id、parent_id=${parentPageId}。`
    : `父页面名称为「${parentPageTitle}」。`;

  const tasks = [
    {
      id: "draft_intro",
      title: "起草文章标题与引言",
      description: `请调用 echo 技能，将以下内容作为 text 参数传入：\n标题：${taskTitle}\n引言：多智能体系统通过将复杂任务拆解为可并行执行的子任务，显著提升了自动化流程的效率与可靠性。\n调用 echo 后，输出 finish，在 description 中填写 echo 回来的内容。`,
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
      description: `请调用 notion_operator 技能，在目标父页面下创建一个新页面，要求如下：\n- ${parentPageHint}\n- 页面标题：${taskTitle}\n- 页面内容：将前置任务输出摘要中的标题、引言和正文内容整合为完整文章，写入页面正文。\n- operate_type 参数填写：create_page\n- instruction 中必须明确指定父页面名称或父页面 ID，禁止省略父容器信息\n调用成功后，输出 finish，在 description 中填写 Notion 页面创建结果（包含页面 URL 或 ID）。`,
      dependsOn: ["draft_intro", "draft_body"],
      maxAttempts: 2,
    },
  ];

  const graphResult = await runTaskGraph({
    goal: taskGoal,
    tasks,
    maxParallelSubAgents: 2,
    runIdPrefix: "acceptance",
    onRoundStart: ({ round, launchIds }) => {
      log("scheduler", `round=${round} launch=[${launchIds.join(", ")}]`);
    },
    executeSubtask: async (node, dag) => {
      const result = await runSubAgentTask(
        node,
        (_subtask: SubtaskNode) => ({
          tabId: runtime.tabId,
          onStep: (step: any) => {
            const action = step.state?.planner_output?.action;
            if (step.node === "planner" && action) {
              log(node.id, `${action.type}${action.skill_name ? `(${action.skill_name})` : ""} ${action.description ?? ""}`);
            }
          },
        }),
        dag,
      );

      const summary = extractTaskGraphSummary(result.finalState, extractSummary(result.finalState));
      return {
        success: result.success,
        summary,
        finalState: result.finalState,
        error: result.error?.message,
      };
    },
  });

  const subtaskResults: Record<string, SubtaskExecutionSnapshot> = Object.fromEntries(
    Object.entries(graphResult.subtaskResults).map(([id, result]) => [
      id,
      {
        success: result.success,
        summary: result.summary ?? "",
        finalState: result.finalState,
        error: result.error,
      },
    ]),
  );

  const dagState = graphResult.schedulerRuntime;
  log("dag", `completed=[${dagState.completed.join(", ")}]`);
  log("dag", `failed=[${dagState.failed.join(", ")}]`);
  log("dag", `blocked=[${dagState.blocked.join(", ")}]`);

  const publishSummary = subtaskResults.publish?.summary ?? "";
  const publishReferenceOk = subtaskResults.publish?.success === true && hasNotionReference(publishSummary);

  log("publish", publishSummary || "无返回摘要");
  log("publish", publishReferenceOk ? "✅ 返回中包含 Notion 页面引用" : "❌ 返回中未识别到 Notion 页面 URL / ID");

  return {
    dagState,
    subtaskResults,
    publishSummary,
    publishReferenceOk,
  };
}

function buildSyntheticFinalState(flow: SchedulerFlowResult) {
  return {
    request: taskGoal,
    status: flow.publishReferenceOk ? "FINISHED" : "FAILED",
    scheduler_runtime: flow.dagState,
    subtask_results: flow.subtaskResults,
    total_history: [
      {
        step: 1,
        ts: Date.now() - 5000,
        action: { type: "call_skill", skill_name: "echo" },
        result: { status: flow.subtaskResults.draft_intro?.success ? "success" : "failed" },
        step_summary: "调用 echo 生成文章标题与引言",
      },
      {
        step: 2,
        ts: Date.now() - 4000,
        action: { type: "call_skill", skill_name: "echo" },
        result: { status: flow.subtaskResults.draft_body?.success ? "success" : "failed" },
        step_summary: "调用 echo 生成文章正文",
      },
      {
        step: 3,
        ts: Date.now() - 2000,
        action: { type: "call_skill", skill_name: "notion_operator" },
        result: { status: flow.subtaskResults.publish?.success ? "success" : "failed" },
        step_summary: `调用 notion_operator 创建 Notion 页面。结果：${flow.publishSummary || "无摘要"}`,
      },
      {
        step: 4,
        ts: Date.now(),
        action: { type: "finish" },
        result: { status: flow.publishReferenceOk ? "success" : "failed" },
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
    meta_data: {
      url: "",
      title: "多智能体协作文章发布任务",
      page_content: "",
    },
  };
}

async function runMemoryCompression(runtime: any, flow: SchedulerFlowResult): Promise<MemorySyncReport> {
  section("Step 2: 记忆压缩与云端同步");

  const syncReport = await runtime.syncMemory(buildSyntheticFinalState(flow));
  log("memory", `experienceJobTriggered=${syncReport.experienceJobTriggered}`);
  log("memory", `experienceJobCompleted=${syncReport.experienceJobCompleted}`);
  log("memory", `syncBackendType=${syncReport.syncBackendType}`);
  log("memory", `cloudSyncSucceeded=${syncReport.cloudSyncSucceeded}`);
  if (syncReport.reason) {
    log("memory", `reason=${syncReport.reason}`);
  }
  if (syncReport.pendingQueueCount > 0 || syncReport.pendingTaskRunCount > 0) {
    log("memory", `pendingQueue=${syncReport.pendingQueueCount}, pendingTaskRuns=${syncReport.pendingTaskRunCount}`);
  }
  return syncReport;
}

async function verifyRetrieval() {
  section("Step 3: L2 / L3 检索验证");

  const rules = await retrieveL2RulesBySkillNames(["notion_operator", "echo"]);
  const notionPair = rules.get("notion_operator");
  const echoPair = rules.get("echo");
  const l3Rules = await l3Bm25Index.search("多智能体 DAG 调度", { limit: 3 });

  if (notionPair?.base) {
    log("L2", `✅ notion_operator 规则已写入: ${notionPair.base.id}`);
  } else {
    log("L2", "❌ notion_operator 未检索到 L2 规则");
  }

  if (echoPair?.base) {
    log("L2", `ℹ️ echo 规则已写入: ${echoPair.base.id}`);
  } else {
    log("L2", "ℹ️ echo 暂无 L2 规则");
  }

  log("L3", `检索到 ${l3Rules.length} 条 L3 记忆`);
  l3Rules.slice(0, 2).forEach((rule, index) => {
    log("L3", `[${index + 1}] ${rule.memoryTitle}: ${rule.tacticalRules.slice(0, 80)}...`);
  });

  return {
    notionL2: Boolean(notionPair?.base),
    echoL2: Boolean(echoPair?.base),
    l3Count: l3Rules.length,
  };
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║      End-to-End Acceptance: DAG + Notion + Memory + Sync      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  process.env.VITE_MULTI_AGENT_SCHEDULER = "true";

  const preflight = await runPreflight();
  if (!preflight.ok) {
    section("Final Report");
    console.log("  Preflight        : ❌ Failed");
    preflight.issues.forEach((issue) => console.log(`    - ${issue}`));
    console.log("\n❌ FAIL — End-to-end acceptance");
    process.exit(1);
  }

  const runtime = await bootstrapNode();

  let flow: SchedulerFlowResult | null = null;
  let syncReport: MemorySyncReport | null = null;
  let retrieval: Awaited<ReturnType<typeof verifyRetrieval>> | null = null;

  try {
    flow = await runSchedulerFlow(runtime, preflight);
    syncReport = await runMemoryCompression(runtime, flow);
    retrieval = await verifyRetrieval();
  } catch (err: any) {
    console.error("\n[fatal]", err?.message || String(err));
  } finally {
    await runtime.cleanup();
  }

  section("Final Report");

  const dagOk = Boolean(
    flow &&
    flow.dagState.failed.length === 0 &&
    flow.dagState.blocked.length === 0 &&
    flow.subtaskResults.publish?.success,
  );
  const publishOk = Boolean(flow?.publishReferenceOk);
  const memoryJobOk = Boolean(syncReport?.experienceJobTriggered && syncReport?.experienceJobCompleted);
  const cloudSyncOk = Boolean(
    syncReport?.syncBackendType === "notion" &&
    syncReport?.syncBackendAvailable &&
    syncReport?.cloudSyncSucceeded,
  );
  const notionL2Ok = Boolean(retrieval?.notionL2);
  const l3Ok = Boolean((retrieval?.l3Count ?? 0) > 0);
  const allOk = dagOk && publishOk && memoryJobOk && cloudSyncOk && notionL2Ok && l3Ok;

  console.log(`  Preflight        : ${preflight.ok ? "✅ Passed" : "❌ Failed"}`);
  console.log(`  DAG Scheduling   : ${dagOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`  Notion Publish   : ${publishOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`  Memory Compress  : ${memoryJobOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`  Cloud Sync       : ${cloudSyncOk ? "✅ Passed" : "❌ Failed"}`);
  console.log(`  L2 Retrieval     : ${notionL2Ok ? "✅ Hit" : "❌ Miss"}`);
  console.log(`  L3 Retrieval     : ${l3Ok ? `✅ ${retrieval?.l3Count} hits` : "❌ Miss"}`);

  console.log(`\n${allOk ? "✅ PASS" : "❌ FAIL"} — End-to-end acceptance`);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
