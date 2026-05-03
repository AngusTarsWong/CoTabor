import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { log } from "../../../shared/utils/log";
import { getLlmClientHeaders } from "../../../shared/utils/llm-headers";

export interface SubAgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface SubAgentConfig {
  systemPrompt: string;
  tools: SubAgentTool[];
  modelName: string;
  apiKey: string;
  baseUrl?: string;
  maxIterations?: number;
  /** Called when the model requests a tool. Returns the tool result string. */
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Optional: return true to immediately finish with SUCCESS after this tool result. */
  shouldEarlyExit?: (toolName: string, result: string) => boolean;
  tag: string;
}

export interface SubAgentResult {
  status: "SUCCESS" | "FAIL";
  data?: unknown;
  error?: string;
  suggestion?: string;
}

/**
 * Generic ReAct-style sub-agent loop.
 *
 * The caller supplies the system prompt, tool list, model config, and a
 * tool-executor callback. This function handles the message loop, tool
 * dispatch, and termination.
 */
export async function runSubAgentLoop(
  instruction: string,
  config: SubAgentConfig,
): Promise<SubAgentResult> {
  const { systemPrompt, tools, modelName, apiKey, baseUrl, maxIterations = 5, executeTool, shouldEarlyExit, tag } = config;

  const openAITools = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  const llm = new ChatOpenAI({
    modelName,
    apiKey,
    temperature: 0.1,
    configuration: baseUrl ? { baseURL: baseUrl, defaultHeaders: getLlmClientHeaders() } : { defaultHeaders: getLlmClientHeaders() },
  }).bindTools(openAITools);

  let messages: any[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(instruction),
  ];

  log.info(tag, `Starting sub-agent loop for: ${instruction.slice(0, 80)}`);

  for (let i = 0; i < maxIterations; i++) {
    const response = await llm.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      log.info(tag, "Sub-agent loop complete.");
      return { status: "SUCCESS", data: response.content };
    }

    for (const tc of response.tool_calls) {
      log.info(tag, `Executing tool: ${tc.name}`);
      try {
        const result = await executeTool(tc.name, tc.args as Record<string, unknown>);
        messages.push(new ToolMessage({ tool_call_id: tc.id!, content: result.substring(0, 15000), name: tc.name }));
        if (shouldEarlyExit?.(tc.name, result)) {
          log.info(tag, `Early exit triggered by tool: ${tc.name}`);
          return { status: "SUCCESS", data: result };
        }
      } catch (e: any) {
        log.error(tag, `Tool execution failed: ${e.message}`);
        messages.push(new ToolMessage({ tool_call_id: tc.id!, content: `执行报错，请根据错误信息重试或放弃: ${e.message}`, name: tc.name }));
      }
    }
  }

  return { status: "FAIL", error: "MAX_ITERATIONS", suggestion: "Sub-agent exceeded max iterations." };
}
