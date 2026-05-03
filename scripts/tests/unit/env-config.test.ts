import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ENV, setDynamicConfig } from "../../../src/shared/constants/env.ts";

describe("ENV dynamic llm config", () => {
  it("reflects runtime llmConfig updates after module initialization", () => {
    setDynamicConfig({}, { replace: true });

    const baseline = {
      apiKey: ENV.LLM_API_KEY,
      baseUrl: ENV.LLM_BASE_URL,
      modelName: ENV.LLM_MODEL,
    };

    assert.equal(ENV.LLM_API_KEY, baseline.apiKey);
    assert.equal(ENV.LLM_BASE_URL, baseline.baseUrl);
    assert.equal(ENV.LLM_MODEL, baseline.modelName);

    setDynamicConfig(
      {
        VITE_LLM_API_KEY: "openrouter-key",
        VITE_LLM_BASE_URL: "https://openrouter.ai/api/v1",
        VITE_LLM_MODEL: "openrouter/model",
      },
      { replace: true },
    );

    assert.equal(ENV.LLM_API_KEY, "openrouter-key");
    assert.equal(ENV.LLM_BASE_URL, "https://openrouter.ai/api/v1");
    assert.equal(ENV.LLM_MODEL, "openrouter/model");
    assert.equal(ENV.PLANNER_CONFIG.apiKey, "openrouter-key");
    assert.equal(ENV.PLANNER_CONFIG.baseUrl, "https://openrouter.ai/api/v1");
    assert.equal(ENV.PLANNER_CONFIG.modelName, "openrouter/model");
  });

  it("replaces stale llmConfig keys instead of merging removed fields", () => {
    setDynamicConfig({}, { replace: true });

    const baseline = {
      apiKey: ENV.LLM_API_KEY,
      baseUrl: ENV.LLM_BASE_URL,
      modelName: ENV.LLM_MODEL,
    };

    setDynamicConfig(
      {
        VITE_LLM_API_KEY: "stale-key",
        VITE_LLM_BASE_URL: "https://stale.example/v1",
        VITE_LLM_MODEL: "stale-model",
      },
      { replace: true },
    );

    setDynamicConfig(
      {
        VITE_LLM_BASE_URL: "https://openrouter.ai/api/v1",
        VITE_LLM_MODEL: "fresh-model",
      },
      { replace: true },
    );

    assert.equal(ENV.LLM_API_KEY, baseline.apiKey);
    assert.equal(ENV.LLM_BASE_URL, "https://openrouter.ai/api/v1");
    assert.equal(ENV.LLM_MODEL, "fresh-model");
  });
});
