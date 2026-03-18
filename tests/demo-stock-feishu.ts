import "dotenv/config";
import { agentGraph } from "../src/core/graph/graph";
import { SkillRegistry } from "../src/skills/registry";
import { MemorySaver } from "@langchain/langgraph";
import { Skill } from "../src/skills/types";
import { HumanMessage } from "@langchain/core/messages";

async function runDemo() {
  console.log("===========================================");
  console.log("🚀 CoTabor Skill System Demo: Stock -> Feishu");
  console.log("===========================================\n");

  // 1. Initialize Skill Registry
  console.log("-> [1] Initializing Skill Registry...");
  // We need to inject the registry instance into the singleton so executor can use it
  const { skillRegistry } = await import("../src/skills/registry");
  // We don't have a way to inject it easily, so let's just use the singleton everywhere
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
    meta_data: { url: "https://www.google.com" }, // Start at google, doesn't matter
  };

  try {
    const stream = await agent.stream(initialState, agentConfig);
    
    for await (const chunk of stream) {
      for (const [nodeName, nodeState] of Object.entries(chunk)) {
        console.log(`\n--- [Node: ${nodeName}] ---`);
        
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
    
    console.log("\n✅ Demo completed successfully!");

  } catch (err) {
    console.error("\n❌ Demo failed with error:", err);
  }
}

runDemo();