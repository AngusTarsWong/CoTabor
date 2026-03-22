import "dotenv/config";
import { agentGraph } from "../src/core/graph/graph";
import { MemorySaver } from "@langchain/langgraph";
import { Skill } from "../src/skills/types";
import { HumanMessage } from "@langchain/core/messages";
import { skillRegistry } from "../src/skills/registry";
import { initNodeCdpClient } from "../src/drivers/cdp/node-client";

async function runDemo() {
  console.log("===========================================");
  console.log("🚀 CoTabor Skill System Demo: Stock -> Feishu (Browser Mode)");
  console.log("===========================================\n");

  // 0. Initialize Node CDP Client and connect to Chrome
  console.log("-> [0] Initializing Browser Connection (Port 9222)...");
  
  let activeTabId: number;
  try {
    const pages = await initNodeCdpClient("http://localhost:9222");
    if (pages.length === 0) {
      console.error("❌ No browser pages found.");
      process.exit(1);
    }
    
    // Find a valid page target (not background page or extension)
    const pageTargets = pages.filter((t: any) => t.type === 'page' && !t.url.startsWith('chrome-extension://'));
    if (pageTargets.length === 0) {
      console.error("❌ No valid browser page found. Please open a normal tab in Chrome.");
      process.exit(1);
    }
    
    // Convert string ID to number hash or use simple counter for mock tabId in Node environment
    // Note: Node CDP usually uses string targetIds, but our extension CDP uses number tabIds.
    // The node-client should handle mapping or we use a mock tabId 1 for the first target.
    activeTabId = 1; // Assuming node-client maps tabId 1 to the first target
    console.log(`✅ Connected to browser target: ${pageTargets[0].title} (Mapped to tabId: ${activeTabId})`);
  } catch (err: any) {
    console.error(`❌ Failed to connect to Chrome: ${err.message}`);
    console.log("   Please ensure Chrome is running with: --remote-debugging-port=9222");
    process.exit(1);
  }

  // 1. Initialize Skill Registry
  console.log("-> [1] Initializing Skill Registry...");
  // Use static import consistently to avoid Node module cache issues (Singleton)
  await skillRegistry.loadAll();
  const allSkills = skillRegistry.getAllSkills();
  console.log(`\n✅ Loaded ${allSkills.length} skills in total:`);
  allSkills.forEach((s: Skill) => console.log(`   - ${s.name} (${s.type})`));

  // 2. Initialize LangGraph Agent
  console.log("\n-> [2] Initializing LangGraph Agent...");
  const memory = new MemorySaver();
  const agentConfig = {
    configurable: { thread_id: "demo-thread-1" }
  };
  const agent = agentGraph;

  // 3. User Input
  const userQuery = "帮我调研一下苹果(AAPL)的最新股市信息，并将调研结果保存到飞书文档中，标题为'苹果股市分析报告'，最后把飞书文档的链接发给我。";
  console.log(`\n🧑 User: "${userQuery}"\n`);

  console.log("-> [3] Executing Agent Workflow...\n");

  const initialState = {
    request: userQuery,
    messages: [new HumanMessage(userQuery)],
    total_history: [],
    available_skills: allSkills,
    meta_data: { 
      url: "https://www.google.com",
      tabId: activeTabId // Pass the active Tab ID to the state for Executor/Skills to use
    },
  };

  try {
    const stream = await agent.stream(initialState, agentConfig);
    let finalState: any = null;
    
    for await (const chunk of stream) {
      for (const [nodeName, nodeState] of Object.entries(chunk)) {
        console.log(`\n--- [Node: ${nodeName}] ---`);
        finalState = nodeState;
        
        // Print relevant state changes
        const state = nodeState as any;
        if (nodeName === "memory") {
            const skills = state.available_skills || [];
            console.log(`🧠 Memory loaded ${skills.length} available skills.`);
        } else if (nodeName === "planner") {
            const action = state.planner_output?.action;
            if (action) {
                console.log(`📝 Planner decided to: ${action.type}`);
                if (action.type === 'call_skill') {
                    console.log(`   Skill: ${action.skill_name}`);
                    console.log(`   Params:`, action.params);
                }
            } else {
                console.log(`📝 Planner output: ${state.messages?.[state.messages.length - 1]?.content}`);
            }
        } else if (nodeName === "executor") {
            const result = state.total_history?.[state.total_history.length - 1];
            if (result) {
                console.log(`⚙️  Executor completed: ${result.action?.type}`);
                console.log(`   Success: ${result.result?.success}`);
                if (result.result?.data) {
                    console.log(`   Result:`, result.result?.data);
                }
            }
        } else if (nodeName === "watchdog") {
            console.log(`🐕 Watchdog feedback: ${state.watchdog_output?.reason || 'Looks good'}`);
        } else if (nodeName === "router") {
            console.log(`🔄 Routing...`);
        }
      }
    }
    
    // Validation of Demo Success
    const lastMessage = finalState?.messages?.[finalState.messages.length - 1];
    const watchdogStatus = finalState?.watchdog_output?.status;
    
    if (watchdogStatus === "FAIL" && !finalState.planner_output?.action) {
      console.log("\n❌ Demo failed: Watchdog rejected the execution and graph stopped.");
    } else if (lastMessage && lastMessage.content) {
      console.log("\n✅ Demo completed successfully!");
      console.log("Final Answer:", lastMessage.content);
    } else {
      console.log("\n⚠️ Demo stopped with unknown status.");
    }

  } catch (err) {
    console.error("\n❌ Demo failed with error:", err);
  }
}

runDemo();