import "dotenv/config";
import "fake-indexeddb/auto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LLMMocker } from "../mocks/llm";

if (typeof globalThis.sessionStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

describe("Integration: Agent Graph Engine (Mocked)", () => {
  it("should successfully invoke the core agent graph with mocked LLM", async () => {
    const mocker = new LLMMocker();
    
    // Mock the planner to instantly finish the task
    mocker.addRule({
      nodeMatch: "planner",
      response: `\`\`\`json
{
  "type": "finish",
  "description": "Task is mock finished",
  "task_list": []
}
\`\`\``
    });

    const { agentGraph } = await import("../../../src/core/graph/graph");
    
    const initialState = {
      request: "Go to Google News and read the latest tech news, then summarize it.",
      task_list: [
        { id: "task1", goal: "Navigate to Google News", description: "Open news.google.com", status: "待办" as const },
        { id: "task2", goal: "Read News", description: "Read headlines", status: "待办" as const }
      ],
      total_history: [],
      scratchpad: [],
      status: "RUNNING" as const,
      messages: [],
      meta_data: {
        page_content: `
        [Page: Google Search]
        - Input(selector="#search-input", value="")
        - Button(selector="#search-btn", text="Google Search")
        - Link(selector="#news-link", text="News")
        - Link(selector="#images-link", text="Images")
        `
      }
    };

    try {
      const finalState = await agentGraph.invoke(initialState, {
        recursionLimit: 5,
        configurable: { thread_id: "test-graph-agent" },
      });

      assert.equal(finalState.status, "FINISHED", "Graph should finish successfully");
      assert.equal(finalState.total_history.length, 1, "Should have 1 history step");
      assert.equal(finalState.total_history[0].action.type, "finish");
    } finally {
      mocker.destroy();
    }
  });
});
