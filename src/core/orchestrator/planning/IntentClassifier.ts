import { z } from "zod";
import { ENV } from "../../../shared/constants/env";
import { invokeLLM, type TokenUsage } from "../../../shared/utils/llm-stream";
import { createLlmClient, getLaneModelName } from "../../../shared/llm/provider";

const responseSchema = z.object({
  useSwarm: z.boolean(),
  reason: z.string()
});

export interface IntentClassificationResult {
  useSwarm: boolean;
  reason: string;
  tokenUsage?: TokenUsage;
}

export async function classifyIntent(goal: string): Promise<IntentClassificationResult> {
  const config = ENV.PLANNER_CONFIG;
  if (!config.enabled) {
    return { useSwarm: false, reason: "Planner model is disabled" };
  }

  const llm = await createLlmClient("planner", "main", { temperature: 0.1, timeout: 30000 });

  const systemPrompt = `你是一个高级任务路由助手。你的任务是分析用户的目标，并决定该目标是否需要启动“蜂群模式”（Swarm Mode / 多 Agent 协作 / DAG 模式）。

判断标准：
- 如果任务可以完全在“当前所在的单一网页”内完成（例如“总结当前网页”、“翻译这段文本”、“点击这个按钮”），请返回 useSwarm: false。
- 如果任务需要跨越多个网页、需要打开新的搜索页面获取信息、或者任务极其复杂需要分步分工协作（例如“去网上搜索关于XX的信息然后汇总”、“帮我定一张机票并把行程发到邮箱”），请返回 useSwarm: true。

请以严格的 JSON 格式返回你的判断结果：
{
  "useSwarm": boolean,
  "reason": "简要解释为什么"
}`;

  const messages: Array<[string, string]> = [
    ["system", systemPrompt],
    ["human", `任务目标：${goal}\n\n请输出 JSON 结果。`]
  ];

  try {
    const modelName = getLaneModelName("planner") || ENV.LLM_MODEL || "unknown";
    const result = await invokeLLM(llm, messages, "intent_classifier", modelName, "main");
    // Clean up potential markdown formatting from LLM output
    let content = result.content;
    const match = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
        content = match[1];
    } else {
        content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    }
    
    const parsed = JSON.parse(content);
    const validated = responseSchema.parse(parsed);
    
    return {
      useSwarm: validated.useSwarm,
      reason: validated.reason,
      tokenUsage: result.tokenUsage
    };
  } catch (error) {
    console.warn("[IntentClassifier] Classification failed, falling back to single mode:", error);
    return { useSwarm: false, reason: "Classification failed due to error" };
  }
}
