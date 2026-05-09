import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditFailureBlocksFinish, validateRecoveryFinish } from "../../../src/core/graph/nodes/replanner";
import type { HistoryStep } from "../../../src/core/types/history";

function historyStep(reason: string): HistoryStep {
  return {
    step: 2,
    action: {
      type: "ui_interact",
      intent: "提取当前页面搜索结果中前3条新闻",
      description: "提取新闻数据",
    },
    result: { success: true },
    audit: { status: "FAIL", reason, intent: "提取新闻数据" },
    step_summary: `提取新闻数据 — 未达到预期：${reason}`,
  };
}

describe("replanner recovery finish guard", () => {
  it("blocks finish when latest audit says no data was extracted", () => {
    const step = historyStep("未成功提取到符合要求的相关新闻条目信息，无有效采集数据返回");

    const action = validateRecoveryFinish(
      { type: "finish", result: "未成功识别页面上已加载完成的有效结果，可直接提取数据。" },
      { lastStep: step, request: "采集阿里巴巴新闻" },
    );

    assert.equal(auditFailureBlocksFinish(step), true);
    assert.equal(action.type, "ui_interact");
    assert.match(action.intent, /禁止直接结束任务/);
  });

  it("allows finish when there is no unresolved audit failure", () => {
    const action = { type: "finish", result: "任务已经实际完成，结果如下。" };

    assert.equal(
      validateRecoveryFinish(action, { request: "采集阿里巴巴新闻" }),
      action,
    );
  });
});
