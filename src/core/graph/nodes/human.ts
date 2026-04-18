import { interrupt } from "@langchain/langgraph";
import { AgentState } from "../state";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";

/**
 * Human-in-the-Loop 节点
 * 在需要用户确认或介入时暂停图执行，等待用户响应后恢复。
 *
 * 触发条件（由 planner 决定）：
 * - "confirmation"：即将执行不可逆操作（提交表单、发送消息、删除数据等）
 * - "login"：当前页面需要用户登录 / 验证码需要手动完成
 */
export const humanNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Human] Waiting for user input ---");

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Human] Stop requested. Skipping human confirmation step.");
    return buildStoppedState(state);
  }

  const action = state.planner_output?.action;

  const interruptPayload = {
    type: (action?.human_type as "confirmation" | "login") || "confirmation",
    message: action?.human_message || "请确认 Agent 即将执行的操作",
    action_description: action?.description,
  };

  // interrupt() 暂停图，将 payload 传递给 UI
  // resume 时 humanResponse 为用户通过 Command({ resume: ... }) 传入的值
  const humanResponse = interrupt(interruptPayload) as { confirmed: boolean };

  if (!humanResponse?.confirmed) {
    // 用户取消 → 在历史记录中标记取消，交回 planner 重新规划
    console.log("--- [Node: Human] User cancelled the action ---");
    const history = state.total_history;
    const lastItem = history[history.length - 1];
    return {
      status: "RUNNING",
      total_history: [
        ...history.slice(0, -1),
        { ...lastItem, result: { success: false, reason: "Cancelled by user" } },
      ],
      meta_data: { ...state.meta_data, human_cancelled: true },
    };
  }

  // 用户确认 → 继续到 executor
  console.log("--- [Node: Human] User confirmed, proceeding to executor ---");
  return {
    status: "RUNNING",
    meta_data: { ...state.meta_data, human_cancelled: false },
  };
};
