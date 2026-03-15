import { AgentState } from "../state";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

export const plannerNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Planner] ---");
  
  const { request, screenshot, total_history, long_term_memory } = state;
  
  // 1. 构建提示词 (Prompt) 结构 (这里预留给后续真实 LLM 接入)
  const historyContext = long_term_memory?.summary ? `Long Term Memory:\n${long_term_memory.summary}\n` : "";
  const promptText = `Goal: ${request}\n\n${historyContext}`;
  
  console.log(`[Planner] Thinking about goal: ${request}`);
  console.log(`[Planner] Current history length: ${total_history.length}`);

  // 2. Mock LLM 思考与规划过程
  // 真实场景下这里会调用: await llm.invoke([...])
  let actionData: any = null;
  let status: AgentState['status'] = "RUNNING";

  // 极简 Mock 逻辑：根据已执行步数决定下一步
  if (total_history.length === 0) {
    // 第一步：假装识别到了需要点击的坐标
    actionData = {
      type: "click",
      x: 300,
      y: 400,
      description: "Click on the search input box"
    };
  } else if (total_history.length === 1) {
    // 第二步：假装输入文字
    actionData = {
      type: "type",
      text: "CoTabor Github",
      description: "Type search keywords"
    };
  } else if (total_history.length === 2) {
    // 第三步：继续点击搜索按钮 (为了触发超过3步的记忆压缩，我们多加几步)
    actionData = {
      type: "click",
      x: 400,
      y: 500,
      description: "Click on search button"
    };
  } else if (total_history.length === 3) {
    // 第四步：滚动页面
    actionData = {
      type: "scroll",
      deltaX: 0,
      deltaY: 200,
      description: "Scroll down to see results"
    };
  } else {
    // 超过四步，认为任务完成
    actionData = {
      type: "finish",
      description: "Task completed successfully"
    };
    status = "FINISHED"; // 标记为已完成
  }

  // 3. 构建供 UI 展示的 Message 记录
  const newMessages = [];
  if (screenshot) {
    newMessages.push(new HumanMessage({
      content: [
        { type: "text", text: "Planner Input Screen" },
        // 注意：由于图片可能会让控制台日志极长，实际插件开发中可能不需要将其全量塞入Message，
        // 这里遵循原架构保留多模态 Message 结构
        // { type: "image_url", image_url: { url: `data:image/jpeg;base64,${screenshot}` } }
      ]
    }));
  }
  
  newMessages.push(new AIMessage({
    content: `I decided to do: ${actionData.type} - ${actionData.description}`
  }));

  console.log(`--- [Planner] Decided Action: ${actionData.type} ---`);

  // 4. 返回规划结果更新 State
  return {
    planner_output: { action: actionData },
    messages: newMessages,
    status: status
  };
};
