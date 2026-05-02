import "dotenv/config";

if (!process.env.VITE_MULTI_AGENT_SCHEDULER) {
  process.env.VITE_MULTI_AGENT_SCHEDULER = "true";
}

import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { orchestrator } from "../../src/core/orchestrator/AgentOrchestrator";
import { planDagLaunchFromGoal } from "../../src/core/orchestrator/planning/DagLaunchPlanner";
import type { TaskGraphTaskInput } from "../../src/core/orchestrator/types/TaskGraph";
import type { SchedulerRuntimeState } from "../../src/core/orchestrator/types/SchedulerState";

type Mode = "plan" | "run";

type SiteConfig = {
  key: string;
  label: string;
  url: string;
  directUrl: string;
  query: string;
  patterns: RegExp[];
};

type PlannedDagReport = {
  goal: string;
  subtasks: TaskGraphTaskInput[];
  executionMode?: string;
  maxParallelSubAgents?: number;
  siteTaskMap: Record<string, string>;
  synthesisTaskId?: string;
  warnings: string[];
};

type RunResult = {
  status?: string;
  schedulerRuntime?: SchedulerRuntimeState;
  subtaskResults?: Record<string, any>;
  resourceRuntime?: any;
  finalSummary?: string;
  dagResolution?: any;
};

const SITES: SiteConfig[] = [
  {
    key: "google_news",
    label: "Google News",
    url: "https://news.google.com/",
    directUrl:
      "https://news.google.com/search?q=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans",
    query: "人工智能",
    patterns: [/google\s*news/i, /谷歌新闻/, /news\.google/i],
  },
  {
    key: "bing_news",
    label: "Bing News",
    url: "https://www.bing.com/news",
    directUrl:
      "https://www.bing.com/news/search?q=artificial+intelligence&cc=us&setlang=en-US&FORM=HDRSC6",
    query: "artificial intelligence",
    patterns: [/bing\s*news/i, /必应新闻/, /bing/i],
  },
  {
    key: "bbc_news",
    label: "BBC News",
    url: "https://www.bbc.com/news",
    directUrl: "https://www.bbc.co.uk/search?q=artificial+intelligence&d=NEWS_PS",
    query: "artificial intelligence",
    patterns: [/bbc\s*news/i, /\bbbc\b/i],
  },
  {
    key: "baidu_news",
    label: "百度新闻",
    url: "https://news.baidu.com/",
    directUrl:
      "https://www.baidu.com/s?rtt=1&bsst=1&cl=2&tn=news&rsv_dl=ns_pc&word=%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD",
    query: "人工智能",
    patterns: [/百度新闻/, /baidu\s*news/i, /news\.baidu/i],
  },
];

const DEFAULT_GOAL = [
  "请访问 Google News、Bing News、BBC News，以及百度新闻，围绕“人工智能”做一份综合新闻分析。",
  "要求：",
  "1. 每个新闻源分别提取 2 到 3 条最值得关注的新闻要点",
  "2. 每个新闻源都要产出一段简短摘要，并明确写出来源站点",
  "3. 最后输出一份综合对比总结，包含共同关注主题、各站点报道重点差异，以及中文和英文新闻源的视角差异",
  "4. 如果适合并行，请自动拆成 DAG 子任务并执行",
  "5. 最终输出 finish，并在 description 中返回完整综合结论",
].join("\n");

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

function log(tag: string, msg: string) {
  const short = msg.length > 180 ? `${msg.slice(0, 180)}…` : msg;
  console.log(`  [${tag}] ${short}`);
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.split("=");
      return [key, rest.join("=")];
    }),
  );

  const mode = args.mode === "plan" ? "plan" : "run";
  const goal = args.goal?.trim() || DEFAULT_GOAL;
  return { mode: mode as Mode, goal };
}

function taskText(task: TaskGraphTaskInput): string {
  return [task.id, task.title, task.goal, task.description].filter(Boolean).join(" ");
}

function detectSiteKey(task: TaskGraphTaskInput): string | undefined {
  const text = taskText(task);
  return SITES.find((site) => site.patterns.some((pattern) => pattern.test(text)))?.key;
}

function detectSynthesisTaskId(tasks: TaskGraphTaskInput[], siteTaskIds: Set<string>): string | undefined {
  const candidate = tasks.find((task) => {
    const dependsOn = task.dependsOn ?? task.depends_on ?? [];
    return dependsOn.length >= 3 && dependsOn.every((depId) => siteTaskIds.has(depId));
  });
  return candidate?.id;
}

function buildSiteTaskDescription(task: TaskGraphTaskInput, site: SiteConfig): string {
  const original = task.description?.trim() || task.goal?.trim() || task.title?.trim() || site.label;
  return [
    original,
    `请优先基于当前已打开的 ${site.label} 页面完成任务；当前页面目标 URL 为 ${site.directUrl}。`,
    `无需重复站内搜索，除非当前页面明显不是 ${site.label} 或没有加载出与“${site.query}”相关的结果。`,
    `最终请提取 2 到 3 条与“${site.query}”最相关的最新新闻要点，并明确标注来源为 ${site.label}。`,
  ].join("\n");
}

function enrichPlannedTasks(tasks: TaskGraphTaskInput[]): { tasks: TaskGraphTaskInput[]; siteTaskMap: Record<string, string>; synthesisTaskId?: string } {
  const siteTaskMap: Record<string, string> = {};

  const enriched = tasks.map((task) => {
    const siteKey = detectSiteKey(task);
    if (!siteKey) {
      return {
        ...task,
        metadata: { ...(task.metadata ?? {}) },
      };
    }

    const site = SITES.find((item) => item.key === siteKey)!;
    siteTaskMap[siteKey] = task.id || siteKey;

    return {
      ...task,
      description: buildSiteTaskDescription(task, site),
      maxAttempts: 1,
      resourceProfile: task.resourceProfile ?? "page_read",
      metadata: {
        ...(task.metadata ?? {}),
        targetUrl: site.directUrl,
        homepageUrl: site.url,
        sourceSite: site.label,
        preferredQuery: site.query,
      },
    };
  });

  const synthesisTaskId = detectSynthesisTaskId(enriched, new Set(Object.values(siteTaskMap)));
  return { tasks: enriched, siteTaskMap, synthesisTaskId };
}

function validatePlannedDag(goal: string, tasks: TaskGraphTaskInput[], executionMode?: string, maxParallelSubAgents?: number): PlannedDagReport {
  const warnings: string[] = [];
  const enriched = enrichPlannedTasks(tasks);

  for (const site of SITES) {
    if (!enriched.siteTaskMap[site.key]) {
      warnings.push(`缺少新闻源节点：${site.label}`);
    }
  }

  if (!enriched.synthesisTaskId) {
    warnings.push("未识别到汇总节点，要求至少有一个依赖 4 个新闻源节点的综合任务");
  }

  if (executionMode !== "isolated_tabs") {
    warnings.push(`planner executionMode=${executionMode || "missing"}，测试会强制改用 isolated_tabs`);
  }

  if ((maxParallelSubAgents ?? 0) < 2) {
    warnings.push(`planner maxParallelSubAgents=${maxParallelSubAgents ?? "missing"}，并发度偏低`);
  }

  return {
    goal,
    subtasks: enriched.tasks,
    executionMode,
    maxParallelSubAgents,
    siteTaskMap: enriched.siteTaskMap,
    synthesisTaskId: enriched.synthesisTaskId,
    warnings,
  };
}

function extractSummary(result: any): string {
  const candidates = [
    result?.final_summary,
    result?.dag_resolution?.finalSummary,
    result?.planner_output?.action?.result,
    result?.planner_output?.action?.description,
    result?.output,
    result?.summary,
    result?.data,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function assertPlan(report: PlannedDagReport) {
  if (report.subtasks.length < 5) {
    throw new Error(`规划结果子任务不足，当前仅 ${report.subtasks.length} 个`);
  }
  if (report.warnings.some((item) => item.startsWith("缺少新闻源节点") || item.startsWith("未识别到汇总节点"))) {
    throw new Error(report.warnings.join("；"));
  }
}

async function runPlan(goal: string): Promise<PlannedDagReport> {
  section("Step 0: 自动规划 DAG");
  const planned = await planDagLaunchFromGoal(goal);
  const report = validatePlannedDag(
    planned.payload.goal,
    planned.payload.subtasks ?? [],
    planned.payload.executionMode,
    planned.payload.maxParallelSubAgents,
  );

  log("plan", `goal=${report.goal}`);
  log("plan", `subtasks=${report.subtasks.length}, executionMode=${report.executionMode ?? "missing"}, maxParallel=${report.maxParallelSubAgents ?? "missing"}`);
  Object.entries(report.siteTaskMap).forEach(([siteKey, taskId]) => {
    const site = SITES.find((item) => item.key === siteKey)!;
    log("plan", `${site.label} -> ${taskId}`);
  });
  if (report.synthesisTaskId) {
    log("plan", `synthesis=${report.synthesisTaskId}`);
  }
  report.warnings.forEach((warning) => log("warn", warning));
  assertPlan(report);
  return report;
}

async function runDag(report: PlannedDagReport): Promise<RunResult> {
  section("Step 1: 启动多新闻源 DAG");
  const runtime = await bootstrapNode({ headless: false });
  const sandboxTabDriver = runtime.createSandboxTabDriver?.();
  if (!sandboxTabDriver) {
    throw new Error("当前 node runtime 不支持 isolated_tabs sandbox driver");
  }
  if (process.env.VITE_MULTI_AGENT_SCHEDULER !== "true") {
    throw new Error("VITE_MULTI_AGENT_SCHEDULER 未启用，无法进入 DAG 调度模式");
  }

  return await new Promise<RunResult>(async (resolve, reject) => {
    try {
      await orchestrator.runInCurrentTab({
        tabId: runtime.tabId,
        goal: report.goal,
        subtasks: report.subtasks,
        executionMode: "isolated_tabs",
        maxParallelSubAgents: Math.max(4, report.maxParallelSubAgents ?? 4),
        sandboxTabDriver,
        onLog: (msg) => log("orchestrator", msg),
        onStep: (step) => {
          const action = step?.update?.planner_output?.action;
          if (step?.node === "planner" && action) {
            log("step", `${action.type}${action.skill_name ? `(${action.skill_name})` : ""} — ${action.description ?? ""}`);
          }
        },
        onFinish: async (result) => {
          await runtime.cleanup();
          resolve({
            schedulerRuntime: result?.scheduler_runtime,
            subtaskResults: result?.subtask_results,
            resourceRuntime: result?.resource_runtime,
            status: result?.status,
            dagResolution: result?.dag_resolution,
            finalSummary: extractSummary(result),
          });
        },
        onError: async (error) => {
          await runtime.cleanup();
          reject(error);
        },
      });
    } catch (error) {
      await runtime.cleanup();
      reject(error);
    }
  });
}

function verifyRun(report: PlannedDagReport, result: RunResult) {
  section("Step 2: 验收结果");
  const schedulerRuntime = result.schedulerRuntime;
  if (!schedulerRuntime) {
    throw new Error("缺少 scheduler_runtime");
  }

  log("dag", `completed=[${schedulerRuntime.completed.join(", ")}]`);
  log("dag", `failed=[${schedulerRuntime.failed.join(", ")}]`);
  log("dag", `blocked=[${schedulerRuntime.blocked.join(", ")}]`);

  const degradedResolved = schedulerRuntime.failed.length > 0 && Boolean(result.finalSummary?.trim());
  if (schedulerRuntime.blocked.length > 0 && !degradedResolved) {
    throw new Error(`DAG 存在阻塞节点: ${schedulerRuntime.blocked.join(", ")}`);
  }

  const assignments = result.resourceRuntime?.assignments ?? [];
  if (assignments.length < 4) {
    throw new Error(`isolated_tabs 资源分配不足，当前 assignments=${assignments.length}`);
  }

  for (const site of SITES) {
    const taskId = report.siteTaskMap[site.key];
    const summary = result.subtaskResults?.[taskId]?.summary;
    if (!taskId) {
      throw new Error(`新闻源节点映射缺失: ${site.label}`);
    }
    if ((!summary || !summary.trim()) && schedulerRuntime.failed.includes(taskId) && degradedResolved) {
      log("site", `${site.label}: 未成功获取，已由主控 Agent 在最终总结中说明缺失。`);
      continue;
    }
    if (typeof summary !== "string" || !summary.trim()) {
      throw new Error(`Missing source-node summary: ${site.label}`);
    }
    log("site", `${site.label}: ${summary}`);
  }

  if (!report.synthesisTaskId) {
    throw new Error("Missing synthesis task");
  }
  const synthesisSummary = result.subtaskResults?.[report.synthesisTaskId]?.summary ?? result.finalSummary ?? "";
  log("summary", synthesisSummary);

  if (schedulerRuntime.failed.length > 0) {
    if (!synthesisSummary.trim()) {
      throw new Error(`The DAG has failed nodes and the controller did not produce a final summary: ${schedulerRuntime.failed.join(", ")}`);
    }
    log("resolution", result.dagResolution?.reason ?? "The controller agent completed the run with partial results.");
  }

  const requiredKeywords = ["Google", "Bing", "BBC", "百度"];
  const missed = requiredKeywords.filter((keyword) => !synthesisSummary.includes(keyword));
  if (missed.length > 0) {
    throw new Error(`The synthesis summary is missing source comparison coverage: ${missed.join(", ")}`);
  }
}

async function main() {
  const { mode, goal } = parseArgs();
  console.log(`\n[MultiNewsDAG] mode=${mode}`);
  const report = await runPlan(goal);

  if (mode === "plan") {
    console.log("\n✅ PASS — DAG planning validation passed");
    return;
  }

  const result = await runDag(report);
  verifyRun(report, result);
  console.log("\n✅ PASS — Multi-source multi-agent DAG acceptance passed");
}

main().catch((error) => {
  console.error("\n❌ FAIL — Multi-source multi-agent DAG acceptance failed");
  console.error(error);
  process.exit(1);
});
