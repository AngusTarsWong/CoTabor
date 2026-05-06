import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canRunOnRestrictedUrl,
  isRestrictedExecutionUrl,
} from "../../../src/core/graph/nodes/executor.ts";

describe("executor restricted URL policy", () => {
  it("detects browser restricted URLs", () => {
    assert.equal(isRestrictedExecutionUrl("chrome://settings"), true);
    assert.equal(isRestrictedExecutionUrl("about:blank"), true);
    assert.equal(isRestrictedExecutionUrl("https://example.com"), false);
  });

  it("allows navigation-class browser skills on restricted pages", () => {
    assert.equal(canRunOnRestrictedUrl({ type: "call_skill", skill_name: "browser_navigate" }), true);
    assert.equal(canRunOnRestrictedUrl({ type: "call_skill", skill_name: "browser_new_tab" }), true);
    assert.equal(canRunOnRestrictedUrl({ type: "call_skill", skill_name: "browser_click_index" }), false);
    assert.equal(canRunOnRestrictedUrl({ type: "ui_interact" }), false);
  });
});
