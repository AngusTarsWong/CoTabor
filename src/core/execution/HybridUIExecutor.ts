import { ChatOpenAI } from "@langchain/openai";
import { ENV } from "../../shared/constants/env";
import { getPageDriver } from "../../drivers/page";
import { cdpClient } from "../../drivers/cdp";
import { selectRelevantL1Hints } from "../../memory/retrieval/l1-bm25-hint-filter";
import type { MemoryItem } from "../../shared/types/memory";
import { executorGroundingPrompt } from "../../prompts";
import { log } from "../../shared/utils/log";
import { getLlmClientHeaders } from "../../shared/utils/llm-headers";

export interface HybridStep {
  type: "navigate" | "click" | "insert_text" | "press_enter" | "delay" | string;
  index?: number;
  text?: string;
  ms?: number;
  url?: string;
}

export interface HybridUIResult {
  success: boolean;
  message?: string;
  error?: string;
  llmPayloads?: any[];
  debugPayloads?: any[];
}

/**
 * Grounding sub-agent: translates a semantic intent into low-level CDP/PageAgent steps
 * and executes them against the given tab.
 */
export async function runHybridUIExecution(
  intent: string,
  tabId: number,
  currentUrl: string | undefined,
  l1Items: MemoryItem[],
  fallbackExecutorL1Hints: string[],
): Promise<HybridUIResult> {
  const MAX_HYBRID_STEPS = 10;

  const pageDriver = getPageDriver(tabId);
  await pageDriver.init(tabId);

  const domText = await pageDriver.getSemanticDOM();

  const executorL1Hints = selectRelevantL1Hints({
    l1Items,
    intent,
    currentUrl,
    fallbackHints: fallbackExecutorL1Hints,
    limit: 3,
  });

  const llm = new ChatOpenAI({
    modelName: ENV.PLANNER_CONFIG.modelName,
    temperature: 0.1,
    apiKey: ENV.PLANNER_CONFIG.apiKey,
    configuration: { 
      baseURL: ENV.PLANNER_CONFIG.baseUrl,
      defaultHeaders: getLlmClientHeaders()
    },
  });

  const groundingPromptText = executorGroundingPrompt.build({
    domText: domText.substring(0, 18000),
    l1Hints: executorL1Hints,
    intent,
    maxSteps: MAX_HYBRID_STEPS,
  });

  const completion = await llm.invoke(groundingPromptText);
  const content = completion.content as string;
  log.info("Executor", `Raw Hybrid Output: ${content.substring(0, 500)}`);

  const llmPayloads = [
    {
      node: "executor",
      timestamp: Date.now(),
      payload: {
        model: ENV.PLANNER_CONFIG.modelName,
        prompt: groundingPromptText,
        messages: [{ role: "user", content: groundingPromptText }],
        input: {
          intent,
          currentUrl,
          domText,
          executorL1Hints,
        },
      },
      response: content,
      model: ENV.PLANNER_CONFIG.modelName,
      token_usage: (completion as any).usage_metadata
        ? {
            prompt: Number((completion as any).usage_metadata.input_tokens ?? 0),
            completion: Number((completion as any).usage_metadata.output_tokens ?? 0),
            total: Number((completion as any).usage_metadata.total_tokens ?? 0),
          }
        : { prompt: 0, completion: 0, total: 0 },
    },
  ];

  let steps: HybridStep[] = [];
  try {
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```/, "").replace(/```$/, "").trim();
    }
    const parsed = JSON.parse(cleanContent);
    steps = (parsed.steps || parsed.commands || parsed.actions || []).slice(0, MAX_HYBRID_STEPS);
  } catch (e) {
    throw new Error(`指令序列解析失败: ${content.substring(0, 200)}`);
  }

  log.info("Executor", `Executing ${steps.length} hybrid steps.`);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    log.info("Executor", `[Hybrid ${i + 1}/${steps.length}] ${step.type}`, step.index !== undefined ? `index=${step.index}` : step.text || "");

    if (step.type === "navigate" && step.url) {
      await cdpClient.send(tabId, "Page.navigate", { url: step.url });
    } else if (step.type === "click" && step.index !== undefined) {
      await pageDriver.click(String(step.index));
    } else if (step.type === "insert_text" && step.text) {
      await cdpClient.send(tabId, "Input.insertText", { text: step.text });
    } else if (step.type === "press_enter") {
      await cdpClient.send(tabId, "Input.dispatchKeyEvent", {
        type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
      });
      await cdpClient.send(tabId, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
      });
    } else if (step.type === "delay") {
      await new Promise((r) => setTimeout(r, step.ms ?? 300));
      continue;
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  return {
    success: true,
    message: `Hybrid Mission completed: ${intent} (${steps.length} steps)`,
    llmPayloads,
    debugPayloads: [
      {
        node: "executor",
        title: "执行器动作分解",
        input: {
          intent,
          currentUrl,
          executorL1Hints,
        },
        output: {
          steps,
        },
      },
    ],
  };
}
