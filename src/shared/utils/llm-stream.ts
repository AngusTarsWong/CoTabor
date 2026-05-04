import { ChatOpenAI } from "@langchain/openai";

export interface LlmStepEvent {
  type: 'STEP_START' | 'STREAM_CHUNK' | 'STEP_END';
  stepId: number;
  node: string;
  scope?: 'main' | 'background';
  model?: string;
  delta?: string;
  duration_ms?: number;
  tokens?: { input: number; output: number; total: number };
  /** Set when the step threw an error */
  error?: string;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export const stepEventTarget = new EventTarget();
let stepCounter = 0;

function emitStep(event: LlmStepEvent) {
  stepEventTarget.dispatchEvent(new CustomEvent('llm-step', { detail: event }));
}

type LlmStepScope = 'main' | 'background';

export async function streamLLM(
  llm: ChatOpenAI,
  messages: any[],
  node: string,
  modelName: string,
  scope: LlmStepScope = 'main'
): Promise<{ content: string; tokenUsage: TokenUsage }> {
  if (globalThis.__MOCK_STREAM_LLM__) {
    return globalThis.__MOCK_STREAM_LLM__(messages, node, modelName);
  }

  const stepId = ++stepCounter;
  const startTime = Date.now();
  emitStep({ type: 'STEP_START', stepId, node, model: modelName, scope });


  let content = '';
  let rawUsage: any;
  let pendingDelta = '';
  let timerId: any = null;

  const flush = () => {
    if (!pendingDelta) return;
    const toSend = pendingDelta;
    pendingDelta = '';
    emitStep({ type: 'STREAM_CHUNK', stepId, node, delta: toSend, scope });
    timerId = null;
  };

  try {
    const stream = await llm.stream(messages);
    for await (const chunk of stream) {
      if (chunk.content) {
        const delta = String(chunk.content);
        content += delta;
        pendingDelta += delta;
        if (timerId === null) {
          timerId = setTimeout(flush, 32);
        }
      }
      if (chunk.usage_metadata) rawUsage = chunk.usage_metadata;
    }
    if (timerId !== null) clearTimeout(timerId);
    flush();
  } catch (e: any) {
    const tokens = rawUsage
      ? { input: rawUsage.input_tokens ?? 0, output: rawUsage.output_tokens ?? 0, total: rawUsage.total_tokens ?? 0 }
      : undefined;
    emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime, tokens, error: e?.message ?? String(e), scope });
    throw e;
  }
  const tokens = rawUsage
    ? { input: rawUsage.input_tokens ?? 0, output: rawUsage.output_tokens ?? 0, total: rawUsage.total_tokens ?? 0 }
    : undefined;
  emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime, tokens, scope });

  const tokenUsage: TokenUsage = rawUsage
    ? { prompt: rawUsage.input_tokens ?? 0, completion: rawUsage.output_tokens ?? 0, total: rawUsage.total_tokens ?? 0 }
    : { prompt: 0, completion: 0, total: 0 };

  return { content, tokenUsage };
}

export async function invokeLLM(
  llm: ChatOpenAI,
  messages: any[],
  node: string,
  modelName: string,
  scope: LlmStepScope = 'main'
): Promise<{ content: string; tokenUsage: TokenUsage }> {
  if (globalThis.__MOCK_INVOKE_LLM__) {
    return globalThis.__MOCK_INVOKE_LLM__(messages, node, modelName);
  }

  const stepId = ++stepCounter;
  const startTime = Date.now();
  emitStep({ type: 'STEP_START', stepId, node, model: modelName, scope });
  try {
    const completion = await llm.invoke(messages);
    const content = completion.content as string;
    const u = (completion as any).usage_metadata
      || (completion as any).response_metadata?.tokenUsage
      || (completion as any).response_metadata?.usage
      || {};
    const tokenUsage: TokenUsage = {
      prompt: Number(u.input_tokens ?? u.promptTokens ?? u.prompt_tokens ?? 0),
      completion: Number(u.output_tokens ?? u.completionTokens ?? u.completion_tokens ?? 0),
      total: Number(u.total_tokens ?? u.totalTokens ?? 0),
    };
    if (tokenUsage.total === 0 && (tokenUsage.prompt + tokenUsage.completion) > 0) {
      tokenUsage.total = tokenUsage.prompt + tokenUsage.completion;
    }
    emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime, tokens: { input: tokenUsage.prompt, output: tokenUsage.completion, total: tokenUsage.total }, scope });
    return { content, tokenUsage };
  } catch (e: any) {
    emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime, error: e?.message ?? String(e), scope });
    throw e;
  }
}

