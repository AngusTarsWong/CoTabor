
import { agentGraph } from "../../core/graph/graph";
import { AgentState } from "../../core/graph/state";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { perception } from "../../drivers/perception";
import { ProductionAdapter } from "../../drivers/perception/adapters/production";
import { ENV } from "../../shared/constants/env";
import { getVisionDriver } from "../../drivers/vision/index";
import { IAgentLogger, IAgentMemory } from "../../shared/utils/logger/interface";

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
  logger?: IAgentLogger;
  memory?: IAgentMemory;
}

export class ClawAgent {
  private config: AgentConfig;
  private isRunning: boolean = false;
  private threadId: string = crypto.randomUUID();
  private lastKnownState: any = null;

  constructor(config: AgentConfig) {
    this.config = config;
    this.initPerceptionAdapter();
  }

  private initPerceptionAdapter() {
    const midsenseConfig = ENV.MIDSENSE_CONFIG;
    if (midsenseConfig.apiKey) {
      perception.setAdapter(new ProductionAdapter(midsenseConfig));
    }
    // 无 API key 时保持默认 NativeAdapter，开发环境正常运行
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

    // 初始化视觉驱动 (如果是在插件环境下)
    const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
    if (!isNode) {
      try {
        await getVisionDriver().init({ type: 'chrome-extension', tabId: this.config.tabId });
        this.log("[VisionDriver] Successfully initialized Midscene for Chrome Extension.");
      } catch (e: any) {
        this.log(`[VisionDriver] Warning: Failed to initialize Midscene: ${e.message}`);
      }
    }

    // Initial State
    const initialState: Partial<AgentState> = {
      request: this.config.goal,
      messages: [new HumanMessage(this.config.goal)],
      status: "RUNNING",
      total_history: [],
      long_term_memory: { summary: "", notebook: {}, offset: 0 },
      experience_buffer: { site_insights: [], task_wisdom: [] }, // 初始化三核记忆缓冲
      scratchpad: [],
      meta_data: {
        tabId: this.config.tabId,
        human_cancelled: false,
        boundTabId: this.config.tabId,
      },
      task_list: [],
    };

    // Initialize Logger
    if (this.config.logger) {
      await this.config.logger.init({
        goal: this.config.goal,
        tabId: this.config.tabId,
        timestamp: Date.now()
      });
    }

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

      this.log(`[${nodeName}] Step completed.`);

      if (this.config.onStep) {
        await this.config.onStep({ node: nodeName, update: stateUpdate });
      }

      // --- Sync to Logger ---
      if (this.config.logger) {
        await this.config.logger.logStep({ node: nodeName, update: stateUpdate });
      }

      // Check if finished
      if (stateUpdate.status === "FINISHED") {
        this.log("Agent finished task successfully. Processing final memory commit...");
        
        // 1. 运行日志收尾
        if (this.config.logger) {
          await this.config.logger.finish(stateUpdate);
        }

        // 2. 三核记忆持久化 (Sites & Tasks)
        if (this.config.memory) {
          try {
            const buffer = this.lastKnownState.experience_buffer;
            if (buffer) {
              // A. 按域名分组沉淀网站经验
              const domainGroups: Record<string, string[]> = {};
              buffer.site_insights?.forEach((si: any) => {
                if (!domainGroups[si.domain]) domainGroups[si.domain] = [];
                domainGroups[si.domain].push(si.content);
              });

              for (const [domain, insights] of Object.entries(domainGroups)) {
                await this.config.memory.upsertSiteMemory(domain, insights);
              }

              // B. 沉淀任务 SOP
              if (buffer.task_wisdom && buffer.task_wisdom.length > 0) {
                await this.config.memory.upsertTaskSOP(this.config.goal, buffer.task_wisdom);
              }
              this.log("[Memory] Triple-Core Memory successfully persisted to Feishu.");
            }
          } catch (memError: any) {
            this.log(`[Memory] Warning: Failed to persist memory: ${memError.message}`);
          }
        }

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

  /**
   * Get the current logger's URL if available
   */
  getLoggerUrl(): string | undefined {
    return this.config.logger?.getLogUrl?.();
  }

  private log(message: string) {
    if (this.config.onLog) {
      this.config.onLog(message);
    }
    console.log(`[ClawAgent] ${message}`);
  }
}
