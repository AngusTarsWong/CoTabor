import "dotenv/config"; // Load the repository root `.env` file.
import "fake-indexeddb/auto";

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

async function runTest() {
  const { agentGraph } = await import("../../src/core/graph/graph");
  const { ENV } = await import("../../src/shared/constants/env");

  console.log("Starting Phase 3-6 Test...");
  console.log(`[Config] Loaded LLM_PROVIDER: ${ENV.LLM_PROVIDER}`);
  console.log(`[Config] Loaded PLANNER Config: ${JSON.stringify(ENV.PLANNER_CONFIG, null, 2)}`);
  console.log(`[Config] Loaded CORTEX Config:  ${JSON.stringify(ENV.CORTEX_CONFIG, null, 2)}`);
  console.log(`[Config] Loaded WATCHDOG Config: ${JSON.stringify(ENV.WATCHDOG_CONFIG, null, 2)}`);

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
      // Mock the current page state with a compact accessibility-style snapshot.
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
      recursionLimit: 50, // Keep extra headroom for retries during graph execution.
      configurable: { thread_id: "test-graph-agent" },
    });

    console.log("\n====== FINAL RESULT ======");
    console.log(`Final Status: ${finalState.status}`);
    console.log(`History Length: ${finalState.total_history.length}`);
    console.log(`Long Term Memory Summary:\n${finalState.long_term_memory?.summary || "None"}`);
    console.log("==========================");
  } catch (error) {
    console.error("Graph execution failed:", error);
  }
}

runTest();
