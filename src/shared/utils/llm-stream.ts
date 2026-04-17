import { ChatOpenAI } from "@langchain/openai";

export interface LlmStepEvent {
  type: 'STEP_START' | 'STREAM_CHUNK' | 'STEP_END';
  stepId: number;
  node: string;
  model?: string;
  delta?: string;
  duration_ms?: number;
  tokens?: { input: number; output: number; total: number };
}

export const stepEventTarget = new EventTarget();
let stepCounter = 0;

function emitStep(event: LlmStepEvent) {
  stepEventTarget.dispatchEvent(new CustomEvent('llm-step', { detail: event }));
}

export async function streamLLM(
  llm: ChatOpenAI,
  messages: any[],
  node: string,
  modelName: string
): Promise<{ content: string }> {
  const stepId = ++stepCounter;
  const startTime = Date.now();
  emitStep({ type: 'STEP_START', stepId, node, model: modelName });

  let content = '';
  let rawUsage: any;
  let pendingDelta = '';
  let rafId: number | null = null;

  const flush = () => {
    if (!pendingDelta) return;
    const toSend = pendingDelta;
    pendingDelta = '';
    emitStep({ type: 'STREAM_CHUNK', stepId, node, delta: toSend });
    rafId = null;
  };

  try {
    const stream = await llm.stream(messages);
    for await (const chunk of stream) {
      if (chunk.content) {
        const delta = String(chunk.content);
        content += delta;
        pendingDelta += delta;
        if (rafId === null) {
          rafId = requestAnimationFrame(flush) as any;
        }
      }
      if (chunk.usage_metadata) rawUsage = chunk.usage_metadata;
    }
    if (rafId !== null) cancelAnimationFrame(rafId as any);
    flush();
  } finally {
    const tokens = rawUsage
      ? { input: rawUsage.input_tokens ?? 0, output: rawUsage.output_tokens ?? 0, total: rawUsage.total_tokens ?? 0 }
      : undefined;
    emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime, tokens });
  }

  return { content };
}

export async function invokeLLM(
  llm: ChatOpenAI,
  messages: any[],
  node: string,
  modelName: string
): Promise<{ content: string }> {
  const stepId = ++stepCounter;
  const startTime = Date.now();
  emitStep({ type: 'STEP_START', stepId, node, model: modelName });
  try {
    const completion = await llm.invoke(messages);
    const content = completion.content as string;
    const u = (completion as any).usage_metadata;
    const tokens = u
      ? { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, total: u.total_tokens ?? 0 }
      : undefined;
    emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime, tokens });
    return { content };
  } catch (e) {
    emitStep({ type: 'STEP_END', stepId, node, duration_ms: Date.now() - startTime });
    throw e;
  }
}
