import { FeishuBrowserConnector } from "../../../connectors/feishu-browser/index";

// 修复: 正确导入 AgentState 类型
import { AgentState } from "../state";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { skillRegistry } from "../../../skills/registry"; // Import the skill registry

export const executorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Executor] ---");
  
  const { planner_output, meta_data, total_history } = state;
  const tabId = meta_data?.tabId; // 从 meta_data 中获取目标 tabId

  if (!planner_output || !planner_output.action) {
    console.warn("[Executor] No action provided by planner.");
    return {
      status: "FAILED",
      error: "No valid action provided by planner"
    };
  }

  const action = planner_output.action;
  console.log(`[Executor] Executing action: ${action.type}`);

  let executionResult: any = { success: true };
  let newMetaData = {};

  // 如果提供了 tabId，我们才真正调用 CDP，否则只打印日志（方便纯 Node 环境跑通 Graph）
  if (tabId || (action.type === 'inspect_skill')) { 
    try {
      const cdpInput = tabId ? new CdpInput(tabId) : null;
      const cdpTools = tabId ? new CdpTools(tabId) : null;
      
      // 0. Update context (URL) for next step
      if (cdpTools) {
        try {
            const currentUrl = await cdpTools.evaluate<string>('window.location.href');
            newMetaData = { ...newMetaData, url: currentUrl };
        } catch (e) {
            console.warn("[Executor] Failed to get current URL", e);
        }
      }

      // 1. 执行具体动作
      switch (action.type) {
        case "call_skill":
            console.log(`[Executor] Calling skill: ${action.skill_name}`);
            try {
                // Execute the skill via the registry, passing context (tabId)
                const context = state.meta_data?.tabId ? { tabId: state.meta_data.tabId } : undefined;
                const skillResult = await skillRegistry.execute(action.skill_name, action.params || {}, context);
                executionResult = { success: true, skill_result: skillResult };
                // Also update page_content if it's a query skill result, to help Planner context
                if (skillResult && typeof skillResult === 'object') {
                    newMetaData = {
                        ...newMetaData, // Preserve URL
                        page_content: `[Skill Result: ${action.skill_name}]\n${JSON.stringify(skillResult, null, 2)}`
                    };
                }
            } catch (err: any) {
                console.error(`[Executor] Skill execution failed: ${err.message}`);
                executionResult = { success: false, error: err.message };
            }
            break;
        case "inspect_skill":
            console.log(`[Executor] Inspecting skill manual: ${action.skill_name}`);
            try {
                const manual = await skillRegistry.getManual(action.skill_name);
                executionResult = { success: true, manual_content: manual };
                 newMetaData = {
                    page_content: `[Skill Manual: ${action.skill_name}]\n${manual}`
                };
            } catch (err: any) {
                 console.error(`[Executor] Skill inspection failed: ${err.message}`);
                 executionResult = { success: false, error: err.message };
            }
            break;
        case "finish":
          // do nothing
          break;
        case "read":
           // do nothing in real CDP for now, just placeholder
           break;
        default:
          console.warn(`[Executor] Unknown action type: ${action.type}`);
      }

      // 等待 UI 渲染 (模拟真实情况的延迟)
      if (tabId) {
        await new Promise(r => setTimeout(r, 1000));
      
        let pageText = "";
        try {
            if (cdpTools) {
                const url = await cdpTools.evaluate<string>(`window.location.href`);
                
                // 飞书文档特殊处理
                if (FeishuBrowserConnector.isFeishuUrl(url)) {
                console.log(`[Executor] Detected Feishu Document, activating Feishu Connector...`);
                pageText = await FeishuBrowserConnector.readDocument(tabId);
                } else {
                // 常规页面读取
                pageText = await cdpTools.evaluate<string>(`document.body.innerText.substring(0, 5000)`);
                }
                
                const pageTitle = await cdpTools.evaluate<string>(`document.title`);
                
                console.log(`[Executor] Fetched page content from: ${url}`);
                
                // Only overwrite if we haven't set newMetaData from a skill result
                if (!newMetaData.hasOwnProperty('page_content')) {
                    newMetaData = {
                        ...newMetaData,
                        page_content: `[Title: ${pageTitle}]\n[URL: ${url}]\n\n${pageText}`
                    };
                }
                
                // Always ensure URL is up-to-date in metadata
                newMetaData = { ...newMetaData, url: url };
                
                if (action.type === 'read') {
                    executionResult = { success: true, text_content: pageText };
                }
            }
        } catch (err) {
            console.warn(`[Executor] Failed to fetch page content: ${err}`);
        }
      }

    } catch (e: any) {
      console.error(`[Executor] Action execution failed: ${e.message}`);
      executionResult = { success: false, error: e.message };
    }
  } else {
    console.log("[Executor] Mock execution (No tabId provided)");
    
    // MOCK DATA INJECTION FOR NODE.js TEST
    
    if (action.type === "call_skill" && action.skill_name === "browser_navigate") {
        console.log(`[Executor] Mocking navigation to ${action.params?.url}...`);
        executionResult = { success: true, skill_result: { status: "success" } };
        newMetaData = {
            dom_elements: [
                { index: 1, tagName: "a", text: "AI Breakthrough: New model solves math problems", bounds: {x:0, y:0, width:100, height:20} },
                { index: 2, tagName: "a", text: "SpaceX lands Starship on Moon", bounds: {x:0, y:20, width:100, height:20} },
                { index: 3, tagName: "a", text: "Global markets rally", bounds: {x:0, y:40, width:100, height:20} }
            ],
            page_content: `Interactive Elements:
[1] <a> AI Breakthrough: New model solves math problems
[2] <a> SpaceX lands Starship on Moon
[3] <a> Global markets rally
            `
        };
    }
    // 场景2: 点击具体新闻 -> 跳转到详情页
    else if (action.type === "call_skill" && action.skill_name === "browser_click_index") {
        console.log(`[Executor] Mocking click on index ${action.params?.index}...`);
        const articleContent = `
        [Article Content]
        Title: AI Breakthrough: New model solves math problems with 99% accuracy.
        Date: 2024-05-20
        Summary: A new AI model developed by DeepMind has achieved a 99% success rate on the International Math Olympiad questions, surpassing human experts in geometry and algebra. This marks a significant milestone in AGI development.
        `;
        
        executionResult = {
            success: true,
            skill_result: { status: "success" }
        };
        
        // 更新页面内容为文章详情，这样 Planner 下一步就能看到内容了
        newMetaData = {
            dom_elements: [],
            page_content: articleContent
        };
    }
    else if (action.type === "call_skill") {
        executionResult = { success: true, skill_result: { status: "success" } };
    }
    else if (action.type === "finish") {
        executionResult = { success: true };
    }
  }

  // 2. 执行后截图
  let newScreenshot = state.screenshot;
  if (tabId) {
    try {
      const cdpTools = new CdpTools(tabId);
      newScreenshot = await cdpTools.captureScreenshot(80);
      console.log("[Executor] Captured new screenshot.");
    } catch (e: any) {
      console.error(`[Executor] Failed to capture screenshot: ${e.message}`);
    }
  }

  // 3. 构建历史记录
  let updatedHistory = total_history;
  if (total_history && total_history.length > 0) {
    const lastIndex = total_history.length - 1;
    updatedHistory = [...total_history];
    updatedHistory[lastIndex] = {
      ...updatedHistory[lastIndex],
      result: { ...executionResult, screenshot: newScreenshot ? "<base64_hidden_for_log>" : null }
    };
  }
  const stepId = total_history ? total_history.length : 1;

  // 4. 构建 Message
  const messages = [
    new HumanMessage({
      content: `Execution Step ${stepId} Result: ${executionResult.success ? 'Success' : 'Failed'}`
    })
  ];

  console.log("--- [Executor] Execution Completed ---\n");

  return {
    total_history: updatedHistory,
    screenshot: newScreenshot,
    messages: messages,
    // 如果 Executor 执行抛出异常，可以直接标记 FAILED 交给 Cortex
    status: executionResult.success ? state.status : "FAILED",
    meta_data: {
      ...meta_data,
      ...newMetaData
    } // 返回更新后的元数据
  };
};
