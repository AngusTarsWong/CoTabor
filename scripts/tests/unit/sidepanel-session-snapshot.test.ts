import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { validateSidepanelSessionSnapshot } from "../../../src/sidepanel/hooks/useSidepanelSessionSnapshot.ts";

describe("sidepanel session snapshot validation", () => {
  it("accepts a valid v1 snapshot", () => {
    const snapshot = validateSidepanelSessionSnapshot({
      version: 1,
      savedAt: 123,
      logs: [{ sender: "user", text: "hello" }],
      workflowNodes: [],
      agentGoal: "draft",
      boundTabId: 7,
      boundTabTitle: "Docs",
      boundTabUrl: "https://example.com",
      wasRunning: true,
      wasStopping: false,
    });

    assert.equal(snapshot?.savedAt, 123);
    assert.equal(snapshot?.agentGoal, "draft");
    assert.equal(snapshot?.boundTabId, 7);
    assert.equal(snapshot?.wasRunning, true);
  });

  it("rejects incompatible or malformed snapshots", () => {
    assert.equal(validateSidepanelSessionSnapshot({ version: 2, savedAt: 123, logs: [], workflowNodes: [] }), null);
    assert.equal(validateSidepanelSessionSnapshot({ version: 1, savedAt: 123, logs: {}, workflowNodes: [] }), null);
    assert.equal(validateSidepanelSessionSnapshot({ version: 1, savedAt: 123, logs: [], workflowNodes: {} }), null);
  });
});
