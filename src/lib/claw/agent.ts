
import { agentGraph } from "../../core/graph/graph";
import { AgentState } from "../../core/graph/state";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { perception } from "../../drivers/perception";
import { ProductionAdapter } from "../../drivers/perception/adapters/production";
import { ENV } from "../../shared/constants/env";
import { getVisionDriver } from "../../drivers/vision/index";
import { IAgentMemory } from "../../shared/utils/memory/interface";
import type { TaskGraphTaskInput, TaskGraphReplanningConfig } from "../../core/orchestrator/types/TaskGraph";
import type { TaskGraphExecutionMode } from "../../core/orchestrator/types/TaskGraphPolicy";
import type { SandboxRuntimeSnapshot } from "../../core/orchestrator/types/ResourceRuntime";
import type { SandboxTabDriver } from "../../core/orchestrator/runtime/SandboxTabAllocator";
import { finalizeStoppedState, shouldFinalizeStopAfterChunk } from "./stop-finalizer";
import { clearAgentStopRequest, requestAgentStop } from "./stop-signal-registry";

export interface HumanRequest {
  type: "confirmation" | "login" | "captcha" | "2fa" | "stuck";
  message: string;
  action_description?: string;
}

export interface AgentConfig {
  tabId: number;
  goal: string;
  subtasks?: TaskGraphTaskInput[];
  maxParallelSubAgents?: number;
  executionMode?: TaskGraphExecutionMode;
  replanning?: TaskGraphReplanningConfig;
  sandboxTabDriver?: SandboxTabDriver;
  swarmMode?: boolean;
  allowSpawnDag?: boolean;
  onResourceRuntimeUpdate?: (snapshot: SandboxRuntimeSnapshot | null) => void;
  onStep?: (step: any) => void | Promise<void>;
  /** Pre-populated notebook data to inject as the sub-agent's initial long_term_memory.notebook. */
  initialNotebook?: Record<string, any>;
  onFinish?: (result: any) => void;
  onError?: (error: any) => void;
  onStopped?: (result: any) => void;
  onHumanRequest?: (request: HumanRequest) => void;
  onLog?: (msg: string) => void;
  memory?: IAgentMemory;
}

export class ClawAgent {
  private config: AgentConfig;
  public isRunning: boolean = false;
  private threadId: string = crypto.randomUUID();
  public lastKnownState: any = null;
  private _taskRunId: string | undefined;

  constructor(config: AgentConfig) {
    this.config = config;
    this.initPerceptionAdapter();
  }

  private initPerceptionAdapter() {
    const midsenseConfig = ENV.MIDSENSE_CONFIG;
    if (midsenseConfig.apiKey) {
      perception.setAdapter(new ProductionAdapter(midsenseConfig));
    }
    // Without an API key, keep the default `NativeAdapter` so development still works.
  }

  /**
   * Start the agent workflow
   */
  async start(): Promise<any> {
    if (this.isRunning) {
      this.log("Agent is already running.");
      return this.lastKnownState;
    }

    this.isRunning = true;
    this.log(`Starting Agent for goal: "${this.config.goal}" on tab ${this.config.tabId}`);

    // Initialize the vision driver when running inside the extension runtime.
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    if (!isNode) {
      try {
        await getVisionDriver().init({ type: 'chrome-extension', tabId: this.config.tabId });
        this.log("[VisionDriver] Successfully initialized Midscene for Chrome Extension.");
      } catch (e: any) {
        this.log(`[VisionDriver] Warning: Failed to initialize Midscene: ${e.message}`);
      }
    }

    // Pre-generate a stable task run ID so retrieval and scheduler share the same attribution scope.
    const taskRunId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this._taskRunId = taskRunId;

    // Initial State
    const initialState: Partial<AgentState> = {
      request: this.config.goal,
      task_run_id: taskRunId,
      messages: [new HumanMessage(this.config.goal)],
      status: "RUNNING",
      total_history: [],
      long_term_memory: { summary: "", notebook: this.config.initialNotebook ?? {} },
      experience_buffer: { site_insights: [], tool_insights: [], task_wisdom: [] }, // Initialize the three-lane memory buffer
      scratchpad: [],
      stop_requested: false,
      stop_reason: null,
      stop_requested_at: null,
      meta_data: {
        tabId: this.config.tabId,
        human_cancelled: false,
        boundTabId: this.config.tabId,
        agent_thread_id: this.threadId,
        swarmMode: this.config.swarmMode ?? false,
        allowSpawnDag: this.config.allowSpawnDag ?? true,
      },
      task_list: [],
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
      clearAgentStopRequest(this.threadId);
      this.isRunning = false;
    }

    return this.lastKnownState;
  }

  /**
   * Resume the agent after a human-in-the-loop interrupt.
   * Called when the user confirms or cancels via the UI.
   */
  async resume(response: { confirmed: boolean }): Promise<any> {
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
      clearAgentStopRequest(this.threadId);
      this.isRunning = false;
    }
  }

  /**
   * Process a LangGraph stream, handling both normal steps and human interrupts.
   */
  private async _processStream(stream: AsyncIterable<any>) {
    let lastNodeCompletedAt = Date.now();
    let sawTerminalState = false;
    for await (const chunk of stream) {
      // Detect human-in-the-loop interrupt
      if ('__interrupt__' in chunk) {
        const interrupts = (chunk as any).__interrupt__;
        if (!interrupts?.length) continue;
        const interruptData = interrupts[0].value as HumanRequest;
        this.log(`[Human] Waiting for user input: ${interruptData.message}`);
        if (this.config.onHumanRequest) {
          this.config.onHumanRequest(interruptData);
        }
        return; // Pause stream processing — resume() will restart it
      }

      // Normal node chunk
      const nodeName = Object.keys(chunk)[0];
      const stateUpdate = (chunk as any)[nodeName];
      this.lastKnownState = { ...this.lastKnownState, ...stateUpdate };
      const now = Date.now();
      const durationMs = Math.max(0, now - lastNodeCompletedAt);
      lastNodeCompletedAt = now;

      this.log(`[${nodeName}] Step completed.`);

      if (this.config.onStep) {
        await this.config.onStep({ node: nodeName, update: stateUpdate, duration_ms: durationMs, ts: now, taskRunId: this._taskRunId });
      }

      // Update status preview
      if (stateUpdate.status) {
        this.log(`Status changed to: ${stateUpdate.status}`);
      }

      // Check if finished, failed, or cooperatively stopped
      const isTerminal =
        stateUpdate.status === "FINISHED" ||
        stateUpdate.status === "FAILED" ||
        stateUpdate.status === "STOPPED";
      if (isTerminal) {
        sawTerminalState = true;
        break;
      }

      if (shouldFinalizeStopAfterChunk(this.lastKnownState)) {
        this.lastKnownState = finalizeStoppedState(this.lastKnownState);
        sawTerminalState = true;
        this.log(`[${nodeName}] Stop requested, finalizing agent as STOPPED before further graph recovery.`);
        break;
      }
    }

    if (!sawTerminalState && this.lastKnownState) {
      const actionType = this.lastKnownState?.planner_output?.action?.type;
      if (actionType === "finish") {
        this.lastKnownState = {
          ...this.lastKnownState,
          status: "FINISHED",
        };
      } else if (
        this.lastKnownState.status === "NEEDS_REPLAN" ||
        this.lastKnownState.status === "CORTEX_RECOVERY"
      ) {
        this.lastKnownState = {
          ...this.lastKnownState,
          status: "FAILED",
          error:
            this.lastKnownState.error ||
            this.lastKnownState.last_error_context ||
            "Task terminated before recovery could succeed.",
        };
      }
    }

    // --- Post-Stream Final Commit ---
    // At this point, the graph has reached a terminal state (END) or stopped.
    await this.postTaskCommit();
  }

  /**
   * Final commitment of all distilled knowledge and logs
   */
  private async postTaskCommit() {
    const finalState = this.lastKnownState;
    if (!finalState) return;

    if (finalState.stop_requested && (!finalState.status || finalState.status === "STOPPING")) {
      Object.assign(finalState, finalizeStoppedState(finalState));
    }

    const TERMINAL_STATUSES = new Set(["FINISHED", "FAILED", "STOPPED"]);
    if (!TERMINAL_STATUSES.has(finalState.status)) {
      this.log(`[Agent] Graph ended without terminal status (was "${finalState.status}"), normalizing to FAILED.`);
      finalState.error = finalState.error || `Graph terminated unexpectedly from status "${finalState.status}" (likely replan limit exceeded)`;
      finalState.status = "FAILED";
    }

    if (finalState.status === "STOPPED") {
      this.log(`Graph execution stopped with status: STOPPED. Finalizing stop state...`);
    } else {
      this.log(`Graph execution stopped with status: ${finalState.status}. Starting final memory commit...`);
    }

    if (finalState.status === "STOPPED") {
      if (this.config.onStopped) {
        this.config.onStopped(finalState);
      }
      return;
    }

    // Schedule the background experience job without blocking the next user turn.
    if (
      this.config.memory &&
      (finalState.status === "FINISHED" || finalState.status === "FAILED")
    ) {
      try {
        const commitResult = await this.config.memory.commitTaskMemories({
          goal: this.config.goal,
          finalState,
        });
        finalState.task_memory_result = commitResult;
        if (commitResult.scheduled && commitResult.taskRunId) {
          this.log(
            `[Memory] Background experience job scheduled. taskRunId=${commitResult.taskRunId}, status=${commitResult.experienceStatus}.`
          );
        }
      } catch (memError: any) {
        this.log(`[Memory] Warning: Failed to schedule background experience job: ${memError.message}`);
      }
    }

    // Trigger terminal callbacks.
    if (finalState.status === "FINISHED" && this.config.onFinish) {
      this.config.onFinish(finalState);
    } else if (finalState.status === "FAILED" && this.config.onError) {
      this.config.onError(new Error(finalState.error || "Task failed"));
    }
  }

  /**
   * Stop the agent
   */
  async stop() {
    const stopRequestedAt = Date.now();
    requestAgentStop(this.threadId);

    this.lastKnownState = {
      ...this.lastKnownState,
      status: "STOPPING",
      stop_requested: true,
      stop_reason: "Stopped by user",
      stop_requested_at: stopRequestedAt,
      error: null,
    };

    this.log("Stop requested by user. Waiting for current step to finish...");

    try {
      await agentGraph.updateState(
        { configurable: { thread_id: this.threadId } },
        {
          status: "STOPPING",
          stop_requested: true,
          stop_reason: "Stopped by user",
          stop_requested_at: stopRequestedAt,
          error: null,
        }
      );
    } catch (error: any) {
      this.log(`Failed to request stop via graph state: ${error.message}`);
      throw error;
    }
  }

  private log(message: string) {
    console.log(`[ClawAgent] ${message}`);
    this.config.onLog?.(message);
  }
}
