import type { ExperienceSummaryResult } from "./summarizer";
import { summarizeTaskExperience } from "./summarizer";
import { resolveTaskRunGlobalSummary } from "../summary/task-run-summary";
import type { RawTraceRecord, TaskRunRecord } from "../../shared/types/memory";

export interface ExperienceSummaryUpdateStepResult {
  summary: ExperienceSummaryResult;
  resolvedGlobalSummary: string;
  finalState: {
    total_history: any[];
    long_term_memory: { summary: string };
    experience_buffer?: ExperienceSummaryResult["experienceBuffer"];
    llm_payloads: any[];
    meta_data: {
      url?: string;
      title?: string;
    };
    status: string;
  };
}

export async function runExperienceSummaryUpdateStep(input: {
  taskRun: TaskRunRecord;
  rawTraces: RawTraceRecord[];
}): Promise<ExperienceSummaryUpdateStepResult> {
  const totalHistory = input.rawTraces
    .slice()
    .sort((a, b) => a.stepIndex - b.stepIndex)
    .map((trace) => trace.raw);

  const summary = await summarizeTaskExperience({
    total_history: totalHistory,
    status: input.taskRun.status,
    long_term_memory: { summary: input.taskRun.globalSummary || "" },
  });

  const resolvedGlobalSummary = resolveTaskRunGlobalSummary({
    generatedSummary: summary.globalSummary,
    existingSummary: input.taskRun.globalSummary,
  });

  return {
    summary,
    resolvedGlobalSummary,
    finalState: {
      total_history: totalHistory,
      long_term_memory: { summary: resolvedGlobalSummary },
      experience_buffer: summary.experienceBuffer,
      llm_payloads: summary.llmPayloads,
      meta_data: {
        url: input.taskRun.hostUrl,
        title: input.taskRun.hostTitle,
      },
      status: input.taskRun.status,
    },
  };
}
