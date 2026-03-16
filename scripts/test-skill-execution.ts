
import { agentGraph } from "../src/core/graph/graph";
import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../src/core/graph/state";
import * as dotenv from "dotenv";

dotenv.config();

async function testEchoSkill() {
  console.log("=== Testing Echo Skill Execution ===");

  const initialState: any = {
    request: "Please echo 'Hello CoTabor Skill System'",
    total_history: [],
    long_term_memory: { summary: "", notebook: {}, offset: 0 },
    meta_data: {},
    available_skills: [] // Will be auto-populated by memory node
  };

  console.log("Invoking agent graph...");
  const result = await agentGraph.invoke(initialState);
  
  console.log("\n=== Execution Result ===");
  const finalHistory = result.total_history;
  
  if (finalHistory && finalHistory.length > 0) {
      const lastStep = finalHistory[finalHistory.length - 1];
      console.log("Last Step Action:", lastStep.action);
      console.log("Last Step Result:", lastStep.result);
      
      // Verify if echo skill was called
      const skillCall = finalHistory.find((h: any) => h.action.type === 'call_skill' && h.action.skill_name === 'echo');
      if (skillCall) {
          console.log("\n✅ SUCCESS: Echo skill was successfully planned and executed!");
          console.log("Echo Output:", skillCall.result.skill_result);
      } else {
          console.log("\n❌ FAILURE: Echo skill was NOT called.");
      }
  } else {
      console.log("No history generated.");
  }
}

testEchoSkill().catch(console.error);
