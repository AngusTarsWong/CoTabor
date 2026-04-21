import {
  CommittedMemoryDetail,
  ExperienceSyncDetails,
  TaskExperienceBuffer,
} from "../../shared/types/memory";
import { ExperienceJobLiveStatusSnapshot } from "../../memory/experience-job/events";

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
  committedMemories?: CommittedMemoryDetail[];
  syncDetails?: ExperienceSyncDetails;
  error?: string;
  liveStatusSnapshot?: ExperienceJobLiveStatusSnapshot;
};
