import { StateGraph, START, END } from "@langchain/langgraph";
import { plannerNode, PlanItem } from "./nodes/planner";
import { PlaybackEvent } from "./types";

// 定义极简的 Agent 状态
// 目前只包含一个 messages 数组，用于存储对话历史或操作记录
export interface AgentState {
  messages: string[];
  plan: PlanItem[];
  reasoning?: string;
  trace: PlaybackEvent[]; // 执行轨迹，用于回放
}

// 定义一个简单的执行节点
// 这里只是一个示例，后续会替换为真实的执行逻辑
const executionNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  const currentMessages = state.messages;
  const lastMessage = currentMessages[currentMessages.length - 1];
  
  console.log(`[Executor] Processing: ${lastMessage}`);
  
  // 模拟执行结果
  // 增加 trace 记录
  return {
    messages: [`Executed: ${lastMessage}`],
    trace: [{
      type: 'log',
      content: `Executing: ${lastMessage}`,
      timestamp: Date.now()
    } as PlaybackEvent]
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
});



workflow.addNode("planner", plannerNode);
workflow.addNode("executor", executionNode);

workflow.addEdge(START, "planner");
workflow.addEdge("planner", "executor");
workflow.addEdge("executor", END);

export const graph = workflow.compile();

// 导出类型以便外部使用
export type GraphRunnable = typeof graph;
