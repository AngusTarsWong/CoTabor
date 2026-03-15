import "dotenv/config"; // 自动加载根目录的 .env 文件
import { agentGraph } from "./graph";
import { AgentStateAnnotation } from "./state";
import { ENV } from "../../shared/constants/env";

async function runTest() {
  console.log("Starting Phase 3-6 Test...");
  console.log(`[Config] Loaded LLM_PROVIDER: ${ENV.LLM_PROVIDER}`);
  console.log(`[Config] Loaded PLANNER Config: ${JSON.stringify(ENV.PLANNER_CONFIG, null, 2)}`);
  console.log(`[Config] Loaded CORTEX Config:  ${JSON.stringify(ENV.CORTEX_CONFIG, null, 2)}`);
  console.log(`[Config] Loaded WATCHDOG Config: ${JSON.stringify(ENV.WATCHDOG_CONFIG, null, 2)}`);

  const initialState = {
    request: "Go to Google News and read the latest tech news, then summarize it.",
    task_list: [
      { id: "task1", description: "Open news.google.com", status: "pending" as const },
      { id: "task2", description: "Read headlines", status: "pending" as const }
    ],
    total_history: [],
    scratchpad: [],
    status: "RUNNING" as const,
    messages: [],
    meta_data: {
      // 模拟当前页面状态 (Accessibility Tree 简述)
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
      recursionLimit: 50 // 调大递归限制，防止因为重试步骤太多导致报错
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
