import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { ENV } from "../../../shared/constants/env";
import { invokeLLM, type TokenUsage } from "../../../shared/utils/llm-stream";
import type {
  NormalizedLaunchRequest,
  TaskGraphLaunchPayload,
  TaskGraphTaskInput,
} from "../types/TaskGraph";
import { dagPlannerPrompt, dagPlannerRepairPrompt, resolveSystem } from "../../../prompts";
import { getLlmClientHeaders } from "../../../shared/utils/llm-headers";

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

const MAX_PLANNER_ATTEMPTS = 2;

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
  const vars = { goal };
  return [
    ["system", resolveSystem(dagPlannerPrompt, vars)],
    ["human", dagPlannerPrompt.user(vars)],
  ];
}

function buildRepairMessages(goal: string, rawContent: string, errorMessage: string): Array<[string, string]> {
  const vars = { goal, rawContent, errorMessage };
  return [
    ["system", resolveSystem(dagPlannerRepairPrompt, vars)],
    ["human", dagPlannerRepairPrompt.user(vars)],
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

function formatValidationError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue, index) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "root";
        return `${index + 1}. ${path}: ${issue.message}`;
      })
      .join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sumTokenUsage(usages: TokenUsage[]): TokenUsage | undefined {
  if (usages.length === 0) return undefined;
  return usages.reduce(
    (acc, usage) => ({
      prompt: acc.prompt + (usage?.prompt ?? 0),
      completion: acc.completion + (usage?.completion ?? 0),
      total: acc.total + (usage?.total ?? 0),
    }),
    { prompt: 0, completion: 0, total: 0 },
  );
}

function parsePlannerJson(rawContent: string): unknown {
  try {
    return JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`DAG planner returned invalid JSON: ${String(error)}`);
  }
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
      configuration: { 
        baseURL: config.baseUrl,
        defaultHeaders: getLlmClientHeaders()
      },
      modelName: config.modelName,
      temperature: 0.1,
      timeout: 120000,
    });
    return invokeLLM(llm, messages, "dag_launch_planner", modelName, "main");
  });

  const modelName = ENV.PLANNER_CONFIG.modelName || ENV.LLM_MODEL || "unknown";
  const tokenUsages: TokenUsage[] = [];
  let rawContent = "";
  let parsed: unknown;
  let payload: TaskGraphLaunchPayload | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_PLANNER_ATTEMPTS; attempt += 1) {
    const messages =
      attempt === 1
        ? buildPlannerMessages(goal)
        : buildRepairMessages(goal, rawContent, formatValidationError(lastError));

    const result = await execute(messages, modelName);
    rawContent = result.content;
    if (result.tokenUsage) {
      tokenUsages.push(result.tokenUsage);
    }

    try {
      parsed = parsePlannerJson(rawContent);
      payload = normalizeDagLaunchPayload(parsed, goal);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_PLANNER_ATTEMPTS) {
        throw error;
      }
    }
  }

  if (!payload) {
    throw new Error(`DAG planner repair failed: ${formatValidationError(lastError)}`);
  }

  return {
    payload,
    request: toNormalizedLaunchRequest(payload),
    rawContent,
    tokenUsage: sumTokenUsage(tokenUsages),
  };
}
