import { StateGraph, START, END } from "@langchain/langgraph";

// 定义极简的 Agent 状态
// 目前只包含一个 messages 数组，用于存储对话历史或操作记录
export interface AgentState {
  messages: string[];
}

// 定义一个简单的执行节点
// 这里只是一个示例，后续会替换为真实的执行逻辑
const executionNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  const currentMessages = state.messages;
  const lastMessage = currentMessages[currentMessages.length - 1];
  
  console.log(`[Executor] Processing: ${lastMessage}`);
  
  // 模拟执行结果
  // 注意：Reducer 会处理合并，所以这里只需要返回增量更新
  return {
    messages: [`Executed: ${lastMessage}`]
  };
};

// 初始化 StateGraph
const workflow = new StateGraph<AgentState>({
  channels: {
    messages: {
      value: (a: string[], b: string[]) => [...a, ...b],
      default: () => [],
    },
  },
});

workflow.addNode("executor", executionNode);
workflow.addEdge(START, "executor");
workflow.addEdge("executor", END);

// 编译图
export const graph = workflow.compile();

// 导出类型以便外部使用
export type GraphRunnable = typeof graph;
