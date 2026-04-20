import { TaskExperienceBuffer } from "../../shared/types/memory";

export type ExperienceUiState = {
  visible: boolean;
  status: "queued" | "running" | "completed" | "failed";
  text: string;
  taskRunId?: string;
  goal?: string;
  globalSummary?: string;
  experienceBuffer?: TaskExperienceBuffer;
  rawResponse?: string;
  candidates?: number;
  committed?: { L1: number; L2: number; L3: number; DROP: number };
  synced?: boolean;
  error?: string;
};
