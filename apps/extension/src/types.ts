import { PlanItem, PlaybackEvent } from '@cotabor/core';

export interface RecordingSession {
  id: string;
  name: string; // 任务名称或输入内容
  createdAt: number;
  updatedAt: number;
  events: PlaybackEvent[];
  plan: PlanItem[]; // 关联的计划
  messages: string[]; // 对话历史
  status: 'idle' | 'running' | 'completed' | 'failed';
  duration?: number;
}
