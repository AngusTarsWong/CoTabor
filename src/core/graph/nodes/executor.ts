// FeishuBrowserConnector removed - all Feishu operations now go through MCP operator

import { AgentState } from "../state";
import { getPageDriver } from "../../../drivers/page";
import { HumanMessage } from "@langchain/core/messages";
import { skillRegistry } from "../../../skills/registry";
import { emitTrace } from "../../../shared/utils/trace";
import { ENV } from "../../../shared/constants/env";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { perception } from "../../../drivers/perception";

// --- 定义 Executor 内部大模型解析的输出结构 (Schema) ---
const PageAgentActionSchema = z.object({
  actions: z.array(z.object({
    type: z.enum(["click", "type", "scroll", "none"]),
    elementId: z.string().optional().describe("阿里 PageAgent 提取的元素 ID (数字字符串)"),
    text: z.string().optional().describe("需要输入的文本（仅当 type 为 type 时有效）"),
    direction: z.enum(["up", "down"]).optional().describe("滚动方向（仅当 type 为 scroll 时有效）"),
    reason: z.string().describe("为什么执行这个操作")
  })).describe("为了完成用户的语义意图，需要在当前页面执行的一系列底层原子操作")
});

const resolveTargetTabId = async (metaData?: Record<string, any>): Promise<number | undefined> => {
  const boundTabId = metaData?.boundTabId;
  if (boundTabId) return boundTabId;
  const fallbackTabId = metaData?.tabId;
  if (fallbackTabId) return fallbackTabId;
  try {
    if (typeof chrome !== "undefined" && chrome.tabs?.query) {
      const activeTabId = await new Promise<number | undefined>((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs?.[0]?.id));
      });
      if (activeTabId) return activeTabId;
    }
  } catch {}
  return fallbackTabId;
};

const isRestrictedExecutionUrl = (url?: string): boolean => {
  if (!url) return false;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("devtools://")
  );
};

const getTabUrlSafe = async (tabId: number): Promise<string> => {
  try {
    // Try chrome.tabs API first (browser extension environment)
    if (typeof chrome !== "undefined" && chrome.tabs?.get) {
      const tab = await chrome.tabs.get(tabId);
      return tab?.url || "";
    }
    // Fallback: use CDP to get current URL (Node/Puppeteer environment)
    const { cdpClient } = await import("../../../drivers/cdp/index");
    const result = await cdpClient.send(tabId, 'Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true
    });
    return result?.result?.value || "";
  } catch {
    return "";
  }
};

export const executorNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("\n--- [Node: Executor] ---");
  
  const { planner_output, meta_data, total_history } = state;
  const tabId = await resolveTargetTabId(meta_data);

  if (!planner_output || !planner_output.action) {
    console.warn("[Executor] No action provided by planner.");
    return {
      status: "FAILED",
      error: "No valid action provided by planner"
    };
  }

  const action = planner_output.action;
  const effectiveAction = (typeof action?.type === "string" && action.type.startsWith("browser_"))
    ? {
        type: "call_skill",
        skill_name: action.type,
        params: action.params || {},
        description: action.description || `Execute ${action.type}`
      }
    : action;
  console.log(`[Executor] Executing action: ${effectiveAction.type}${effectiveAction.skill_name ? `(${effectiveAction.skill_name})` : ""}`);

  let executionResult: any = { success: true };
  let newMetaData = {};
  if (ENV.DEBUG_MODE) {
    emitTrace({
      node: "executor",
      phase: "enter",
      ts: Date.now(),
      step_id: total_history ? total_history.length : 0,
      action: {
        type: effectiveAction.type,
        tool_name: undefined,
        skill_name: (effectiveAction as any).skill_name,
        params_digest: (effectiveAction as any).params || {}
      },
      state: {
        before: {
          url: meta_data?.url,
          page_content_len: (meta_data?.page_content || "").length
        },
        recentHistory: Array.isArray(total_history) ? total_history.slice(-3) : []
      }
    });
  }

  // 如果提供了 tabId，我们才真正调用 CDP，否则只打印日志（方便纯 Node 环境跑通 Graph）
  if (tabId || (effectiveAction.type === 'inspect_skill')) { 
    try {
      // 0. Update context (URL) for next step
      if (tabId) {
        try {
            // TODO: 需要在 PageDriver 中增加 getCurrentUrl 方法，这里暂时跳过或使用旧的 getTabUrlSafe
            const currentUrl = await getTabUrlSafe(tabId);
            newMetaData = { ...state.meta_data, url: currentUrl };
        } catch (e) {
            console.warn("[Executor] Failed to get current URL", e);
            newMetaData = { ...state.meta_data };
        }
      } else {
        newMetaData = { ...state.meta_data };
      }

      const requiresPageExecution = effectiveAction.type === "call_skill" || effectiveAction.type === "read";
      if (tabId && requiresPageExecution) {
        try {
          const tabUrl = await getTabUrlSafe(tabId);
          if (isRestrictedExecutionUrl(tabUrl)) {
            const guardError = `Blocked execution on restricted URL: ${tabUrl}`;
            console.warn(`[Executor] ${guardError}`);
            executionResult = { success: false, error: guardError };
            newMetaData = {
              ...newMetaData,
              url: tabUrl,
              page_content: `[Guard] ${guardError}`
            };
          }
        } catch (e: any) {
          const guardError = `Failed to validate target tab URL: ${e?.message || String(e)}`;
          console.warn(`[Executor] ${guardError}`);
          executionResult = { success: false, error: guardError };
          newMetaData = {
            ...newMetaData,
            page_content: `[Guard] ${guardError}`
          };
        }
      }

      // 1. 执行具体动作
      if (executionResult.success) {
        switch (effectiveAction.type) {
          case "UI_INTERACT":
              console.log(`[Executor] Grounding intent: ${effectiveAction.intent}`);
              try {
                  // Initialize PageAgentDriver only when we need semantic DOM grounding
                  const pageDriver = getPageDriver();
                  await pageDriver.init(tabId!);
                  
                  // A. 获取页面感知数据
                  const domText = await pageDriver.getSemanticDOM();
                  
                  // B. 内部大模型调用：将 intent 翻译为 PageAgent Actions
                  // 修复 linter 错误：使用 ENV 中正确的字段名
                  const llm = new ChatOpenAI({
                      modelName: ENV.PLANNER_CONFIG.modelName, // 复用 Planner 的模型配置
                      temperature: 0.1,
                      apiKey: ENV.PLANNER_CONFIG.apiKey,
                      configuration: {
                          baseURL: ENV.PLANNER_CONFIG.baseUrl
                      }
                  }).withStructuredOutput(PageAgentActionSchema);

                  const groundingPrompt = `
                  你是一个精确的网页动作转换器。
                  你的任务是将用户的【语义意图】转换为底层的【物理操作序列】。
                  
                  当前页面的精简 DOM 结构如下：
                  <page_dom>
                  ${domText.substring(0, 15000)} // 防止过长
                  </page_dom>
                  
                  用户的意图是：
                  <intent>
                  ${effectiveAction.intent}
                  </intent>
                  
                  请在 <page_dom> 中找到能够完成该意图的元素，并输出操作序列。
                  注意：
                  1. ID 必须是 DOM 中中括号里的数字（例如 [12] -> id="12"）。
                  2. 如果意图无法在当前 DOM 中完成（比如元素不存在），请返回 type="none"，并在 reason 中说明原因。
                  `;

                  const parsedResult = await llm.invoke(groundingPrompt);
                  console.log(`[Executor] Grounding result:`, JSON.stringify(parsedResult.actions));

                  // C. 执行映射出的底层动作序列
                  for (const act of parsedResult.actions) {
                      if (act.type === 'none') {
                          throw new Error(`无法在当前页面完成意图: ${act.reason}`);
                      }
                      
                      console.log(`[PageAgent] Executing: ${act.type} on [${act.elementId}]`);
                      
                      let opSuccess = false;
                      if (act.type === 'click' && act.elementId) {
                          opSuccess = await pageDriver.click(act.elementId);
                      } else if (act.type === 'type' && act.elementId && act.text) {
                          opSuccess = await pageDriver.type(act.elementId, act.text);
                      } else if (act.type === 'scroll' && act.direction) {
                          opSuccess = await pageDriver.scroll(act.direction);
                      }

                      if (!opSuccess) {
                          throw new Error(`PageAgent 底层操作执行失败: ${act.type} on ${act.elementId}`);
                      }
                      
                      // 操作间稍微等待，让前端框架响应
                      await new Promise(r => setTimeout(r, 500));
                  }
                  
                  executionResult = { success: true, message: `Intent completed: ${effectiveAction.intent}` };
                  
              } catch (err: any) {
                  console.error(`[Executor] UI Interaction failed: ${err.message}`);
                  executionResult = { success: false, error: err.message };
              }
              break;
          case "memorize":
              const memorizeKey = effectiveAction.key || effectiveAction.params?.key;
              const memorizeValue = effectiveAction.value || effectiveAction.params?.value;
              console.log(`[Executor] Memorizing data: ${memorizeKey} = ${memorizeValue}`);
              executionResult = { success: true, message: `Memorized ${memorizeKey}` };
              break;
          case "call_skill":
              console.log(`[Executor] Calling skill: ${effectiveAction.skill_name}`);
              try {
                  const context = tabId ? { tabId } : undefined;
                  const skillResult = await skillRegistry.execute(effectiveAction.skill_name, effectiveAction.params || {}, context);
                  executionResult = { success: true, skill_result: skillResult };
                  if (skillResult && typeof skillResult === 'object') {
                      newMetaData = {
                          ...newMetaData,
                          page_content: `[Skill Result: ${effectiveAction.skill_name}]\n${JSON.stringify(skillResult, null, 2)}`
                      };
                  }
              } catch (err: any) {
                  console.error(`[Executor] Skill execution failed: ${err.message}`);
                  const failedTabUrl = tabId ? await getTabUrlSafe(tabId) : "";
                  executionResult = { success: false, error: err.message };
                  newMetaData = {
                    ...newMetaData,
                    ...(failedTabUrl ? { url: failedTabUrl } : {}),
                    page_content: `[Skill Error: ${effectiveAction.skill_name}] ${err.message}${failedTabUrl ? `\n[URL] ${failedTabUrl}` : ""}`
                  };
              }
              break;
          case "inspect_skill":
              console.log(`[Executor] Inspecting skill manual: ${effectiveAction.skill_name}`);
              try {
                  const manual = await skillRegistry.getManual(effectiveAction.skill_name);
                  executionResult = { success: true, manual_content: manual };
                   newMetaData = {
                      page_content: `[Skill Manual: ${effectiveAction.skill_name}]\n${manual}`
                  };
              } catch (err: any) {
                   console.error(`[Executor] Skill inspection failed: ${err.message}`);
                   executionResult = { success: false, error: err.message };
              }
              break;
          case "finish":
            break;
          case "read":
             break;
          default:
            console.warn(`[Executor] Unknown action type: ${effectiveAction.type}`);
            executionResult = { success: false, error: `Unknown action type: ${effectiveAction.type}` };
        }
      }

      // 等待页面加载稳定
      if (tabId && executionResult.success && effectiveAction.type !== "memorize" && effectiveAction.type !== "inspect_skill") {
        // 使用简单延时等待页面加载，避免依赖 PageAgentDriver
        await new Promise(r => setTimeout(r, 3000));
      
        let pageText = "";
        try {
            if (tabId) {
                const url = await getTabUrlSafe(tabId);
                
                // 使用 CDP 提取页面可见文本
                try {
                  const { cdpClient } = await import("../../../drivers/cdp/index");
                  const textResult = await cdpClient.send(tabId, 'Runtime.evaluate', {
                    expression: 'document.body?.innerText?.substring(0, 10000) || ""',
                    returnByValue: true,
                    awaitPromise: true
                  });
                  pageText = textResult?.result?.value || '';
                } catch (cdpErr) {
                  console.warn(`[Executor] CDP text extraction failed:`, cdpErr);
                  pageText = 'Failed to extract page text';
                }
                
                // 获取页面标题
                let pageTitle = 'Untitled';
                try {
                  const { cdpClient } = await import("../../../drivers/cdp/index");
                  const titleResult = await cdpClient.send(tabId, 'Runtime.evaluate', {
                    expression: 'document.title || ""',
                    returnByValue: true
                  });
                  pageTitle = titleResult?.result?.value || 'Untitled';
                } catch {}
                
                console.log(`[Executor] Fetched page content from: ${url} (${pageText.length} chars)`);
                
                // 不覆盖技能返回的结果
                const allowOverride = !((newMetaData as any).page_content && (newMetaData as any).page_content.startsWith('[Skill'));
                if (allowOverride) {
                  newMetaData = {
                    ...newMetaData,
                    page_content: `[Title: ${pageTitle}]\n[URL: ${url}]\n\n${pageText || 'No text content found on page.'}`
                  };
                }
                
                // Always ensure URL is up-to-date in metadata
                newMetaData = { ...newMetaData, url: url };
                
                if (effectiveAction.type === 'read') {
                    executionResult = { success: true, text_content: pageText };
                }
            }
        } catch (err) {
            console.warn(`[Executor] Failed to fetch page content: ${err}`);
            if (!(newMetaData as any).page_content) {
               newMetaData = {
                 ...newMetaData,
                 page_content: `[Error] Failed to fetch page content: ${err}`
               };
            }
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
    else if (action.type === "memorize") {
        const memorizeKey = action.key || action.params?.key;
        const memorizeValue = action.value || action.params?.value;
        console.log(`[Executor] Mocking memorize: ${memorizeKey} = ${memorizeValue}`);
        executionResult = { success: true, message: `Memorized ${memorizeKey}` };
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
  if (tabId && (ENV.MEDIA_CAPTURE_ON_FAIL ? !executionResult.success : true)) {
    try {
      // TODO: 这里需要重构成使用 pageDriver 或者新的截图工具，先暂时用占位符
      // const cdpTools = new CdpTools(tabId);
      // newScreenshot = await cdpTools.captureScreenshot(80);
      console.log("[Executor] Captured new screenshot. (Placeholder)");
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

  const returnPayload: Partial<AgentState> = {
    total_history: updatedHistory,
    screenshot: newScreenshot,
    messages: messages,
    // 如果 Executor 执行抛出异常，可以直接标记 FAILED 交给 Cortex
    status: executionResult.success ? state.status : "FAILED",
    meta_data: {
      ...meta_data,
      tabId: tabId || meta_data?.tabId,
      ...newMetaData
    } // 返回更新后的元数据
  };

  const parsedKey = action.key || action.params?.key;
  const parsedValue = action.value || action.params?.value;
  if (action.type === "memorize" && parsedKey) {
    returnPayload.long_term_memory = {
      summary: state.long_term_memory?.summary || "",
      offset: state.long_term_memory?.offset || 0,
      notebook: {
        ...(state.long_term_memory?.notebook || {}),
        [parsedKey]: parsedValue
      }
    };
  }

  if (ENV.DEBUG_MODE) {
    emitTrace({
      node: "executor",
      phase: "exit",
      ts: Date.now(),
      step_id: total_history ? total_history.length : 0,
      action: {
        type: action.type,
        tool_name: undefined,
        skill_name: (action as any).skill_name,
        params_digest: (action as any).params || {}
      },
      result: {
        status: executionResult.success ? "success" : "fail",
        error_type: executionResult.error ? "runtime_error" : undefined
      },
      state: {
        after: {
          url: (returnPayload.meta_data as any)?.url,
          page_content_len: ((returnPayload.meta_data as any)?.page_content || "").length
        }
      },
      media: {
        dom_text_digest: ((returnPayload.meta_data as any)?.page_content || "").slice(0, 400),
        screenshot_ref: newScreenshot ? "<base64_hidden_for_log>" : undefined
      }
    });
  }
  return returnPayload;
};
