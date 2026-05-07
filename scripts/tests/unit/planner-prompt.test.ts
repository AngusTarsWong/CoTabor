import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plannerPrompt } from "../../../src/prompts/agent/planner.js";
import { resolveSystem } from "../../../src/prompts/types.js";
import type { PlannerPromptVars } from "../../../src/prompts/agent/planner.js";

const baseVars: PlannerPromptVars = {
  skillsList: "None",
  langInstruction: "",
  request: "test",
  currentPlanStr: "尚未制定具体计划，请先拆解任务。",
  historyContext: "",
  notebookContext: "",
  retrievedMemoryContext: "",
  l1OperationalExperience: "",
  delegationInstruction: "",
  tabContextStr: "",
  lastObservationContext: "",
  recentHistory: "",
  errorContextStr: "",
  currentUrl: "Unknown URL",
  domContext: "Current Page: Unknown",
};

describe("plannerPrompt delegation instruction", () => {
  it("includes spawn_dag only when root delegation instruction is provided", () => {
    const systemPrompt = resolveSystem(plannerPrompt, {
      ...baseVars,
      delegationInstruction: '- **多路并发探索 (spawn_dag)**: output {"type": "spawn_dag"}',
    });
    assert.match(systemPrompt, /spawn_dag/);
  });

  it("does not mention spawn_dag for leaf worker instructions", () => {
    const systemPrompt = resolveSystem(plannerPrompt, {
      ...baseVars,
      delegationInstruction:
        "- **子任务执行者边界**: 当前你是蜂群中的叶子任务执行者，只负责完成当前节点目标。不要引入新的并行、委派、任务拆分或中央调度动作。",
    });
    assert.doesNotMatch(systemPrompt, /spawn_dag/);
    assert.match(systemPrompt, /叶子任务执行者/);
  });
});
