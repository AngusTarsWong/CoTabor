import { StateGraph, START, END } from "@langchain/langgraph";
import { plannerNode, PlanItem } from "./nodes/planner";
import { PlaybackEvent } from "./types";
import { Agent } from "@/core";
import ChromeExtensionProxyPage from "@/web/chrome-extension/page";
import { EXECUTOR_MODEL_CONFIG } from "./config";

// 定义极简的 Agent 状态
// 目前只包含一个 messages 数组，用于存储对话历史或操作记录
export interface AgentState {
  messages: string[];
  plan: PlanItem[];
  reasoning?: string;
  trace: PlaybackEvent[]; // 执行轨迹，用于回放
}

let midsenseAgent: Agent | null = null;

// 初始化 Midsense Agent
const getMidsenseAgent = async () => {
  if (midsenseAgent) return midsenseAgent;

  // 检查是否在 Chrome 扩展环境中
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    console.warn("[Executor] Not in Chrome Extension environment, skipping Midsense initialization");
    return null;
  }

  try {
    const page = new ChromeExtensionProxyPage(false); // forceSameTabNavigation = false
    
    // 获取当前激活的 Tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0 && tabs[0].id) {
      await page.setActiveTabId(tabs[0].id);
      console.log(`[Executor] Attached to tab: ${tabs[0].id}`);
    } else {
      console.warn("[Executor] No active tab found");
    }

    midsenseAgent = new Agent(page, {
      modelConfig: {
        // Midsense expects a flat Record<string, string | number> for env-like config
        "OPENAI_API_KEY": EXECUTOR_MODEL_CONFIG.apiKey || "",
        "OPENAI_BASE_URL": EXECUTOR_MODEL_CONFIG.baseUrl || "",
        "MIDSCENE_MODEL_NAME": EXECUTOR_MODEL_CONFIG.modelName,
        "MIDSCENE_USE_QWEN_VL": EXECUTOR_MODEL_CONFIG.modelName.includes("qwen") ? "1" : "0",
      }
    });

    return midsenseAgent;
  } catch (error) {
    console.error("[Executor] Failed to initialize Midsense Agent:", error);
    return null;
  }
};

// 定义一个简单的执行节点
// 这里只是一个示例，后续会替换为真实的执行逻辑
const executionNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  const plan = state.plan;
  const pendingItems = plan.filter(item => item.status === 'pending');
  const trace: PlaybackEvent[] = [];
  const updatedPlan = [...plan];

  if (pendingItems.length === 0) {
    console.log("[Executor] No pending plan items");
    return {};
  }

  const agent = await getMidsenseAgent();

  if (!agent) {
    console.warn("[Executor] Midsense Agent not available, skipping execution");
    // 标记为失败或者跳过
    return {
      messages: ["Executor skipped: Not in Chrome environment"],
    };
  }

  for (const item of pendingItems) {
    console.log(`[Executor] Executing plan item: ${item.description}`);
    
    // 标记为进行中
    const itemIndex = updatedPlan.findIndex(p => p.id === item.id);
    if (itemIndex !== -1) {
      updatedPlan[itemIndex].status = 'in_progress';
    }

    try {
      // 使用 Midsense 执行操作
      // aiAct 接受自然语言指令并执行
      await agent.aiAct(item.description);
      
      // 记录执行成功
      if (itemIndex !== -1) {
        updatedPlan[itemIndex].status = 'completed';
      }
      
      trace.push({
        type: 'log',
        content: `Executed: ${item.description}`,
        timestamp: Date.now()
      });

    } catch (error: any) {
      console.error(`[Executor] Execution failed for item: ${item.description}`, error);
      
      if (itemIndex !== -1) {
        updatedPlan[itemIndex].status = 'failed';
        updatedPlan[itemIndex].reasoning = error.message;
      }
      
      trace.push({
        type: 'error',
        content: `Failed: ${item.description} - ${error.message}`,
        timestamp: Date.now()
      });
      
      // 如果一个步骤失败，可能需要停止后续步骤
      break; 
    }
  }

  return {
    plan: updatedPlan,
    trace: trace
  };
};

// 初始化 StateGraph
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (a: string[], b: string[]) => [...a, ...b],
      default: () => [],
    },
    plan: {
      value: (a: PlanItem[], b: PlanItem[]) => b,
      default: () => [],
    },
    reasoning: {
      value: (a?: string, b?: string) => b,
      default: () => undefined,
    },
    trace: {
      value: (a: PlaybackEvent[], b: PlaybackEvent[]) => [...(a || []), ...(b || [])],
      default: () => [],
    }
  },
})
  .addNode("planner", plannerNode)
  .addNode("executor", executionNode)
  .addEdge(START, "planner")
  .addEdge("planner", "executor")
  .addEdge("executor", END);

export const graph = workflow.compile();

// 导出类型以便外部使用
export type GraphRunnable = typeof graph;
