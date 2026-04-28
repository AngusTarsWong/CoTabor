import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { ENV } from "../../../shared/constants/env";
import { invokeLLM, type TokenUsage } from "../../../shared/utils/llm-stream";
import type {
  NormalizedLaunchRequest,
  TaskGraphLaunchPayload,
  TaskGraphTaskInput,
} from "../types/TaskGraph";

const resourceProfileSchema = z.enum(["skill_only", "external_io", "page_read", "page_write"]);
const executionModeSchema = z.enum(["shared_tab", "single_page_serial", "isolated_tabs"]);

const taskSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  goal: z.string().trim().optional(),
  description: z.string().trim().min(1),
  dependsOn: z.array(z.string().trim().min(1)).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  resourceProfile: resourceProfileSchema.optional(),
});

const payloadSchema = z.object({
  goal: z.string().trim().min(1),
  executionMode: executionModeSchema.optional(),
  maxParallelSubAgents: z.number().int().min(1).max(6).optional(),
  subtasks: z.array(taskSchema).min(1),
});

export interface DagLaunchPlanResult {
  payload: TaskGraphLaunchPayload;
  request: NormalizedLaunchRequest;
  rawContent: string;
  tokenUsage?: TokenUsage;
}

export interface DagLaunchPlannerOptions {
  execute?: (messages: Array<[string, string]>, modelName: string) => Promise<{ content: string; tokenUsage?: TokenUsage }>;
}

function buildPlannerMessages(goal: string): Array<[string, string]> {
  const systemPrompt = `你是一个多智能体 DAG 任务规划器。你的职责是把用户的自然语言目标拆成可执行的 DAG JSON。

输出要求：
- 只输出 JSON，不要包含 Markdown 代码块，不要输出解释文字。
- JSON 顶层字段必须包含：goal, subtasks。
- subtasks 中每个任务必须包含：id, title, description。
- 若任务存在依赖，用 dependsOn 表示。
- 根据任务特征补 executionMode：
  - shared_tab: 纯技能、外部 IO、或不涉及页面并发冲突
  - single_page_serial: 需要页面读写，但必须串行
  - isolated_tabs: 多个页面敏感任务需要并行
- 根据任务特征补 resourceProfile：
  - skill_only: 纯思考、总结、整理、转写
  - external_io: notion、mcp、数据库、API、发消息
  - page_read: 读取当前页面信息
  - page_write: 点击、输入、滚动、提交
- maxParallelSubAgents 只在确实适合并行时给出，默认 2，页面敏感串行场景应为 1。
- 如果用户目标本身很简单，也要给出最小 DAG，可只有 1 个节点。

约束：
- id 使用简短 snake_case。
- description 必须是直接可执行的子任务描述。
- 不要发明仓库中不存在的技能名，把技能选择留给后续 Agent。
- 如果某个节点依赖前置结果，description 中不要内联前置结果内容，只通过 dependsOn 表达依赖。`;

  const userPrompt = `请把下面这个目标拆成 DAG JSON：\n${goal}`;
  return [
    ["system", systemPrompt],
    ["human", userPrompt],
  ];
}

function normalizeTask(task: z.infer<typeof taskSchema>): TaskGraphTaskInput {
  return {
    id: task.id,
    title: task.title,
    goal: task.goal,
    description: task.description,
    dependsOn: task.dependsOn ?? [],
    maxAttempts: task.maxAttempts,
    resourceProfile: task.resourceProfile,
  };
}

export function normalizeDagLaunchPayload(input: unknown, fallbackGoal: string): TaskGraphLaunchPayload {
  const parsed = payloadSchema.parse(input);
  return {
    mode: "dag",
    goal: parsed.goal || fallbackGoal,
    subtasks: parsed.subtasks.map(normalizeTask),
    maxParallelSubAgents: parsed.maxParallelSubAgents,
    executionMode: parsed.executionMode,
  };
}

function toNormalizedLaunchRequest(payload: TaskGraphLaunchPayload): NormalizedLaunchRequest {
  return {
    mode: "dag",
    source: "ai_plan",
    goal: payload.goal,
    subtasks: payload.subtasks,
    maxParallelSubAgents: payload.maxParallelSubAgents,
    executionMode: payload.executionMode,
  };
}

export async function planDagLaunchFromGoal(
  goal: string,
  options: DagLaunchPlannerOptions = {},
): Promise<DagLaunchPlanResult> {
  const execute = options.execute ?? (async (messages: Array<[string, string]>, modelName: string) => {
    const config = ENV.PLANNER_CONFIG;
    if (!config.enabled) {
      throw new Error("Planner model is disabled in configuration.");
    }

    const llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0.1,
      timeout: 120000,
    });
    return invokeLLM(llm, messages, "dag_launch_planner", modelName, "main");
  });

  const modelName = ENV.PLANNER_CONFIG.modelName || ENV.LLM_MODEL || "unknown";
  const { content, tokenUsage } = await execute(buildPlannerMessages(goal), modelName);

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`DAG planner returned invalid JSON: ${String(error)}`);
  }

  const payload = normalizeDagLaunchPayload(parsed, goal);
  return {
    payload,
    request: toNormalizedLaunchRequest(payload),
    rawContent: content,
    tokenUsage,
  };
}
