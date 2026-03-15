
import { agentGraph } from "../../core/graph/graph";
import { AgentState } from "../../core/graph/state";
import { HumanMessage } from "@langchain/core/messages";

export interface AgentConfig {
  tabId: number;
  goal: string;
  onLog?: (message: string) => void;
  onStep?: (step: any) => void;
  onFinish?: (result: any) => void;
  onError?: (error: any) => void;
}

export class ClawAgent {
  private config: AgentConfig;
  private isRunning: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Start the agent workflow
   */
  async start() {
    if (this.isRunning) {
      this.log("Agent is already running.");
      return;
    }

    this.isRunning = true;
    this.log(`Starting Agent for goal: "${this.config.goal}" on tab ${this.config.tabId}`);

    // Initial State
    const initialState: Partial<AgentState> = {
      request: this.config.goal,
      messages: [new HumanMessage(this.config.goal)],
      status: "RUNNING",
      total_history: [],
      long_term_memory: [],
      scratchpad: [],
      meta_data: {
        tabId: this.config.tabId, // Pass tabId to the graph context
      },
    };

    try {
      // Use stream to get updates for each step
      const stream = await agentGraph.stream(initialState, {
        recursionLimit: 50,
      });

      for await (const chunk of stream) {
        if (!this.isRunning) break;

        // The chunk contains the state update from the last executed node
        const nodeName = Object.keys(chunk)[0];
        const stateUpdate = (chunk as any)[nodeName];

        this.log(`[${nodeName}] Step completed.`);

        // --- Enhanced Logging for Debugging ---
        if (nodeName === 'planner' && stateUpdate.planner_output) {
           const { thought, action } = stateUpdate.planner_output;
           this.log(`[Planner] Thought: ${thought}`);
           if (action) {
               this.log(`[Planner] Action: ${JSON.stringify(action)}`);
           }
        }
        
        if (nodeName === 'executor') {
           if (stateUpdate.meta_data && stateUpdate.meta_data.page_content) {
             const contentPreview = stateUpdate.meta_data.page_content.substring(0, 100).replace(/\n/g, ' ');
             this.log(`[Executor] Page Content Updated: "${contentPreview}..."`);
           } else {
             this.log(`[Executor] Warning: No page content update received.`);
           }
        }
        // --------------------------------------
        
        if (this.config.onStep) {
          this.config.onStep({ node: nodeName, update: stateUpdate });
        }

        // Check if finished
        if (stateUpdate.status === "FINISHED") {
          this.log("Agent finished task successfully.");
          if (this.config.onFinish) {
            this.config.onFinish(stateUpdate);
          }
          this.isRunning = false;
          break;
        }
      }
    } catch (error: any) {
      this.log(`Agent Error: ${error.message}`);
      if (this.config.onError) {
        this.config.onError(error);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Stop the agent
   */
  stop() {
    this.isRunning = false;
    this.log("Agent stopped by user.");
  }

  private log(message: string) {
    if (this.config.onLog) {
      this.config.onLog(message);
    }
    console.log(`[ClawAgent] ${message}`);
  }
}
