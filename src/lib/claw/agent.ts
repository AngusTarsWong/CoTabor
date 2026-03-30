
import { agentGraph } from "../../core/graph/graph";
import { AgentState } from "../../core/graph/state";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";

export interface HumanRequest {
  type: "confirmation" | "login";
  message: string;
  action_description?: string;
}

export interface AgentConfig {
  tabId: number;
  goal: string;
  onLog?: (message: string) => void;
  onStep?: (step: any) => void | Promise<void>;
  onFinish?: (result: any) => void;
  onError?: (error: any) => void;
  onHumanRequest?: (request: HumanRequest) => void;
}

export class ClawAgent {
  private config: AgentConfig;
  private isRunning: boolean = false;
  private threadId: string = crypto.randomUUID();

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
      long_term_memory: { summary: "", notebook: {}, offset: 0 },
      scratchpad: [],
      meta_data: {
        tabId: this.config.tabId,
      },
    };

    try {
      const stream = await agentGraph.stream(initialState, {
        recursionLimit: 50,
        configurable: { thread_id: this.threadId },
      });

      await this._processStream(stream);
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
   * Resume the agent after a human-in-the-loop interrupt.
   * Called when the user confirms or cancels via the UI.
   */
  async resume(response: { confirmed: boolean }) {
    this.isRunning = true;
    this.log(`[Human] Resuming: confirmed=${response.confirmed}`);

    try {
      const stream = await agentGraph.stream(
        new Command({ resume: response }),
        {
          recursionLimit: 50,
          configurable: { thread_id: this.threadId },
        }
      );

      await this._processStream(stream);
    } catch (error: any) {
      this.log(`Resume Error: ${error.message}`);
      if (this.config.onError) {
        this.config.onError(error);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a LangGraph stream, handling both normal steps and human interrupts.
   */
  private async _processStream(stream: AsyncIterable<any>) {
    for await (const chunk of stream) {
      if (!this.isRunning) break;

      // Detect human-in-the-loop interrupt
      if ('__interrupt__' in chunk) {
        const interruptData = (chunk as any).__interrupt__[0].value as HumanRequest;
        this.log(`[Human] Waiting for user input: ${interruptData.message}`);
        if (this.config.onHumanRequest) {
          this.config.onHumanRequest(interruptData);
        }
        return; // Pause stream processing — resume() will restart it
      }

      // Normal node chunk
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
        await this.config.onStep({ node: nodeName, update: stateUpdate });
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
