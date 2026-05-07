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
  subagentResultsContext: "",
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
  it("includes spawn_subagent when root delegation instruction is provided", () => {
    const systemPrompt = resolveSystem(plannerPrompt, {
      ...baseVars,
      delegationInstruction: '- **多路并发子任务 (spawn_subagent)**: output {"type": "spawn_subagent"}',
    });
    assert.match(systemPrompt, /spawn_subagent/);
  });

  it("does not mention spawn_subagent for leaf worker instructions", () => {
    const systemPrompt = resolveSystem(plannerPrompt, {
      ...baseVars,
      delegationInstruction:
        "- **子任务执行者边界**: 当前你是子 Agent，只负责完成当前分配的具体目标。不要尝试启动新的子任务或进行任何委派操作。",
    });
    assert.doesNotMatch(systemPrompt, /spawn_subagent/);
    assert.match(systemPrompt, /子 Agent/);
  });
});
