import { FeishuBrowserConnector } from "../../../connectors/feishu-browser/index";

// 修复: 正确导入 AgentState 类型
import { AgentState } from "../state";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { skillRegistry } from "../../../skills/registry"; // Import the skill registry

export const executorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Executor] ---");
  
  const { planner_output, meta_data } = state;
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
  if (tabId || action.type === 'call_skill' || action.type === 'inspect_skill') { // Skill execution doesn't strictly require tabId (though local skills might)
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
        case "click":
          if (!cdpInput || !cdpTools) throw new Error("CDP not initialized for click action");
          let clickX = action.x;
          let clickY = action.y;

          // 如果没有坐标但有 selector，尝试自动计算坐标
          if ((clickX === undefined || clickY === undefined) && action.selector) {
             try {
               // 注入 JS 获取元素中心点坐标
               const result = await cdpTools.evaluate<{x: number, y: number} | null>(`
                 (function() {
                   const el = document.querySelector('${action.selector}');
                   if (!el) return null;
                   const rect = el.getBoundingClientRect();
                   return { 
                     x: rect.left + rect.width / 2, 
                     y: rect.top + rect.height / 2 
                   };
                 })()
               `);
               
               if (result) {
                 clickX = result.x;
                 clickY = result.y;
                 console.log(`[Executor] Resolved selector "${action.selector}" to (${clickX}, ${clickY})`);
               } else {
                 console.warn(`[Executor] Could not find element with selector: ${action.selector}`);
               }
             } catch (err) {
               console.warn(`[Executor] Error resolving selector: ${err}`);
             }
          }

          if (clickX !== undefined && clickY !== undefined) {
            await cdpInput.click(clickX, clickY);
          } else {
            console.warn(`[Executor] Skipped click: No coordinates provided and selector resolution failed.`);
          }
          break;
        case "type":
          if (!cdpInput) throw new Error("CDP not initialized for type action");
          if (action.text) {
            await cdpInput.typeText(action.text);
          }
          break;
        case "scroll":
          if (!cdpInput) throw new Error("CDP not initialized for scroll action");
          if (action.deltaX !== undefined && action.deltaY !== undefined) {
            await cdpInput.scroll(action.deltaX, action.deltaY);
          }
          break;
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
    
    // 场景1: 点击 "News" 链接 -> 跳转到新闻列表页
    if (action.type === "click" && action.selector?.includes("news-link")) {
        console.log("[Executor] Mocking navigation to Google News Homepage...");
        executionResult = { success: true };
        newMetaData = {
            page_content: `
            [Page: Google News Homepage]
            - Headline 1: "AI Breakthrough: New model solves math problems" (selector="#article-1")
            - Headline 2: "SpaceX lands Starship on Moon" (selector="#article-2")
            - Headline 3: "Global markets rally" (selector="#article-3")
            `
        };
    }
    // 场景2: 点击具体新闻 -> 跳转到详情页 (或者直接 read)
    else if (action.type === "read" || (action.type === "click" && action.selector?.includes("article"))) {
        console.log("[Executor] Injecting Mock News Article Content...");
        const articleContent = `
        [Article Content]
        Title: AI Breakthrough: New model solves math problems with 99% accuracy.
        Date: 2024-05-20
        Summary: A new AI model developed by DeepMind has achieved a 99% success rate on the International Math Olympiad questions, surpassing human experts in geometry and algebra. This marks a significant milestone in AGI development.
        `;
        
        executionResult = {
            success: true,
            text_content: articleContent
        };
        
        // 更新页面内容为文章详情，这样 Planner 下一步就能看到内容了
        newMetaData = {
            page_content: articleContent
        };
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
  const stepId = state.total_history.length + 1;
  const historyItem = {
    step: stepId,
    action: action,
    result: { ...executionResult, screenshot: newScreenshot ? "<base64_hidden_for_log>" : null }
  };

  // 4. 构建 Message
  const messages = [
    new HumanMessage({
      content: `Execution Step ${stepId} Result: ${executionResult.success ? 'Success' : 'Failed'}`
    })
  ];

  console.log("--- [Executor] Execution Completed ---\n");

  return {
    total_history: [historyItem],
    screenshot: newScreenshot,
    messages: messages,
    // 如果 Executor 执行抛出异常，可以直接标记 FAILED 交给 Cortex
    status: executionResult.success ? state.status : "FAILED",
    meta_data: newMetaData // 返回更新后的元数据
  };
};
