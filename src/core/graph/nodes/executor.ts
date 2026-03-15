import { AgentState } from "../state";
import { CdpInput } from "../../../drivers/cdp/input";
import { CdpTools } from "../../../drivers/cdp/tools";
import { HumanMessage } from "@langchain/core/messages";

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
  if (tabId) {
    try {
      const cdpInput = new CdpInput(tabId);
      const cdpTools = new CdpTools(tabId);
      
      // 1. 执行具体动作
      switch (action.type) {
        case "click":
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
          if (action.text) {
            await cdpInput.typeText(action.text);
          }
          break;
        case "scroll":
          if (action.deltaX !== undefined && action.deltaY !== undefined) {
            await cdpInput.scroll(action.deltaX, action.deltaY);
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
      await new Promise(r => setTimeout(r, 1000));
      
      let pageText = "";
      try {
        pageText = await cdpTools.evaluate<string>(`document.body.innerText.substring(0, 5000)`);
        const pageTitle = await cdpTools.evaluate<string>(`document.title`);
        const url = await cdpTools.evaluate<string>(`window.location.href`);
        
        console.log(`[Executor] Fetched page content from: ${url}`);
        
        newMetaData = {
          page_content: `[Title: ${pageTitle}]\n[URL: ${url}]\n\n${pageText}`,
          url: url
        };
        
        if (action.type === 'read') {
             executionResult = { success: true, text_content: pageText };
        }
      } catch (err) {
        console.warn(`[Executor] Failed to fetch page content: ${err}`);
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
