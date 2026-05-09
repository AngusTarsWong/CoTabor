import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cortexNode } from "../../../src/core/graph/nodes/cortex";
import { perception } from "../../../src/drivers/perception";
import { NativeAdapter } from "../../../src/drivers/perception/adapters/native";
import { ProductionAdapter } from "../../../src/drivers/perception/adapters/production";
import type { PerceptionAdapter, ExtractedDOM, WaitResult, LocateResult } from "../../../src/drivers/perception/types";

class NoScreenshotLocateAdapter implements PerceptionAdapter {
  requiresExternalScreenshotForLocate = false;
  public calls = 0;

  async extractDOM(): Promise<ExtractedDOM> {
    throw new Error("not used");
  }

  async waitFor(): Promise<WaitResult> {
    return { met: true, reason: "not used", elapsedMs: 0 };
  }

  async locateElement(params: { screenshot: string; description: string; tabId?: number }): Promise<LocateResult | null> {
    this.calls += 1;
    assert.equal(params.screenshot, "");
    assert.match(params.description, /提取新闻数据/);
    return { x: 10, y: 20, description: params.description };
  }
}

const baseState = {
  request: "采集阿里巴巴新闻",
  total_history: [
    {
      step: 1,
      action: { type: "ui_interact", description: "提取新闻数据" },
      result: { success: true },
      audit: { status: "FAIL", reason: "未提取到有效数据", intent: "提取新闻数据" },
      step_summary: "提取新闻数据 — 未达到预期：未提取到有效数据",
    },
  ],
  scratchpad: [],
  watchdog_output: { status: "FAIL", reason: "未提取到有效数据" },
  screenshot: "",
  meta_data: {},
  status: "RUNNING" as const,
  messages: [],
};

describe("cortex screenshot handling", () => {
  afterEach(() => {
    perception.resetAdapter();
  });

  it("does not block adapters that can locate without an external screenshot", async () => {
    const adapter = new NoScreenshotLocateAdapter();
    perception.setAdapter(adapter);

    const result = await cortexNode.invoke(baseState as any);

    assert.equal(adapter.calls, 1);
    assert.equal(result.status, "RUNNING");
    assert.match(String(result.cortex_thought), /Midsense located and clicking/);
  });

  it("treats the production Midscene adapter as no-external-screenshot", () => {
    perception.setAdapter(new ProductionAdapter({ apiKey: "test-key", model: "ui-tars-7b" }));

    assert.equal(perception.requiresExternalScreenshotForLocate(), false);
  });

  it("preserves the original watchdog reason when screenshot is unavailable", async () => {
    perception.setAdapter(new NativeAdapter());

    const result = await cortexNode.invoke(baseState as any);

    assert.equal(result.status, "NEEDS_REPLAN");
    assert.match(String(result.last_error_context), /Original watchdog failure: 未提取到有效数据/);
    assert.match(String(result.last_error_context), /no screenshot/i);
  });
});
