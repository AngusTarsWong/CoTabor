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
import { cdpClient } from "../../../drivers/cdp";
import { buildStoppedState, shouldStopAtNodeEntry } from "./stop";
import { selectRelevantL1Hints } from "../../../memory/retrieval/l1-bm25-hint-filter";

// --- 定义 Executor 内部大模型解析的输出结构 (Schema) ---
const PageAgentActionSchema = z.object({
  actions: z.array(z.object({
    type: z.enum(["click", "type", "scroll", "press_key", "none"]),
    elementId: z.string().optional().describe("阿里 PageAgent 提取的元素 ID (数字字符串)"),
    text: z.string().optional().describe("需要输入的文本（仅当 type 为 type 时有效）"),
    key: z.string().optional().describe("需要按下的键名（如 'Enter'，仅且仅当 type 为 press_key 时有效）"),
    direction: z.enum(["up", "down"]).optional().describe("滚动方向（仅当 type 为 scroll 时有效）"),
    reason: z.string().describe("为什么执行这个操作")
  })).describe("为了完成用户的语义意图，需要在当前页面执行的一系列底层原子操作")
});

const resolveTargetTabId = async (metaData?: Record<string, any>): Promise<number | undefined> => {
  const boundTabId = metaData?.boundTabId;
  if (boundTabId) return boundTabId;
  const fallbackTabId = metaData?.tabId;
  if (fallbackTabId) return fallbackTabId;
  
  // 铁律：绝对禁止在业务逻辑层调用 chrome.tabs.query({active: true})
  // 强制要求上下文传递正确的 tabId
  console.warn("[Executor] 警告：上下文中缺失 boundTabId 或 tabId，拒绝自动推断 active tab。");
  return undefined;
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

  if (shouldStopAtNodeEntry(state)) {
    console.log("[Executor] Stop requested. Skipping execution step.");
    return buildStoppedState(state);
  }
  
  const { planner_output, meta_data, total_history, retrieved_memories } = state;
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
  const fallbackExecutorL1Hints = retrieved_memories?.executorL1Hints || [];
  const retrievedL1Rules = retrieved_memories?.l1Rules || [];
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
      // 清除旧的 page_content 避免滚雪球效应 (Snowball effect)
      if (tabId) {
        try {
            const currentUrl = await getTabUrlSafe(tabId);
            newMetaData = { ...state.meta_data, url: currentUrl };
        } catch (e) {
            console.warn("[Executor] Failed to get current URL", e);
            newMetaData = { ...state.meta_data };
        }
      } else {
        newMetaData = { ...state.meta_data };
      }
      // 确保当前步骤开始时丢弃上一轮旧的 DOM，只记录本轮结果
      delete (newMetaData as any).page_content;

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
          case "ui_interact":
              console.log(`[Executor] Tactical Sub-Agent: Grounding mission -> ${effectiveAction.intent}`);
              try {
                  const MAX_HYBRID_STEPS = 10;

                  const pageDriver = getPageDriver(tabId!);
                  await pageDriver.init(tabId!);

                  // A. 获取 PageAgent 语义 DOM（含 [index] 标注）
                  const domText = await pageDriver.getSemanticDOM();

                  // B. 战术翻译：混合 PageAgent+CDP 指令集
                  const llm = new ChatOpenAI({
                      modelName: ENV.PLANNER_CONFIG.modelName,
                      temperature: 0.1,
                      apiKey: ENV.PLANNER_CONFIG.apiKey,
                      configuration: { baseURL: ENV.PLANNER_CONFIG.baseUrl }
                  });

                  const executorL1Hints = selectRelevantL1Hints({
                      l1Rules: retrievedL1Rules,
                      intent: effectiveAction.intent,
                      currentUrl: meta_data?.url,
                      fallbackHints: fallbackExecutorL1Hints,
                      limit: 3,
                  });

                  const groundingPrompt = `你是一个浏览器自动化协议工程师。
你的任务是将【上级使命】分解为一组可执行的操作指令序列。

当前页面 DOM（每个可交互元素有一个 [索引号]）：
---
${domText.substring(0, 18000)}
---

已知页面操作经验（优先遵守，如果与当前页面冲突再根据页面现状调整）：
${executorL1Hints.length > 0 ? executorL1Hints.map((hint, index) => `${index + 1}. ${hint}`).join('\n') : '无'}

上级使命 (Mission): "${effectiveAction.intent}"

## 可用操作指令：

1. **click** — 点击指定索引的元素（使用 DOM 中括号内的数字）:
   { "type": "click", "index": 1 }

2. **insert_text** — 在当前聚焦的输入框中插入文本（通过 CDP，不触发逐字事件）:
   { "type": "insert_text", "text": "Artificial Intelligence" }

3. **press_enter** — 在当前聚焦元素上按下回车键（通过 CDP）:
   { "type": "press_enter" }

4. **delay** — 等待指定毫秒数（等页面动画完成）:
   { "type": "delay", "ms": 300 }

## 规则：
- 必须使用 DOM 中真实存在的 [索引号]，不能臆造。
- 点击输入框后，先用 insert_text 输入内容，再用 press_enter 提交。
- 如果页面有明确的搜索/确认按钮，用 click 点击它；否则用 press_enter。
- 最多输出 ${MAX_HYBRID_STEPS} 条指令。

## 输出格式（严格 JSON，无其他文字）：
{
  "steps": [
    { "type": "click", "index": 1 },
    { "type": "delay", "ms": 300 },
    { "type": "insert_text", "text": "Artificial Intelligence" },
    { "type": "press_enter" }
  ]
}`;

                  const completion = await llm.invoke(groundingPrompt);
                  const content = completion.content as string;
                  console.log(`[Executor] Raw Hybrid Output: ${content.substring(0, 500)}`);

                  // C. 解析混合指令序列
                  let steps: Array<{ type: string; index?: number; text?: string; ms?: number }> = [];
                  try {
                      let cleanContent = content.trim();
                      if (cleanContent.startsWith('```json')) {
                          cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
                      } else if (cleanContent.startsWith('```')) {
                          cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
                      }
                      const parsed = JSON.parse(cleanContent);
                      steps = (parsed.steps || parsed.commands || parsed.actions || []).slice(0, MAX_HYBRID_STEPS);
                  } catch (e) {
                      console.error(`[Executor] Failed to parse hybrid JSON: ${e}`);
                      throw new Error(`指令序列解析失败: ${content.substring(0, 200)}`);
                  }

                  // D. 混合执行引擎
                  console.log(`[Executor] Executing ${steps.length} hybrid steps.`);
                  for (let i = 0; i < steps.length; i++) {
                      const step = steps[i];
                      console.log(`[Hybrid ${i + 1}/${steps.length}] ${step.type}`, step.index !== undefined ? `index=${step.index}` : step.text || '');

                      if (step.type === 'click' && step.index !== undefined) {
                          // PageAgent 高级点击（通过 highlightIndex）
                          await pageDriver.click(String(step.index));
                      } else if (step.type === 'insert_text' && step.text) {
                          // CDP 直插文本（规避模型安全过滤）
                          await cdpClient.send(tabId!, 'Input.insertText', { text: step.text });
                      } else if (step.type === 'press_enter') {
                          // CDP 按键回车
                          await cdpClient.send(tabId!, 'Input.dispatchKeyEvent', {
                              type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
                          });
                          await cdpClient.send(tabId!, 'Input.dispatchKeyEvent', {
                              type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13
                          });
                      } else if (step.type === 'delay') {
                          await new Promise(r => setTimeout(r, step.ms ?? 300));
                          continue;
                      }

                      // 步骤间默认等待 400ms
                      await new Promise(r => setTimeout(r, 400));
                  }

                  executionResult = {
                      success: true,
                      message: `Hybrid Mission completed: ${effectiveAction.intent} (${steps.length} steps)`
                  };

              } catch (err: any) {
                  console.error(`[Executor] Tactical execution failed: ${err.message}`);
                  executionResult = { success: false, error: err.message };
              }
              break;

          case "memorize":
              const memorizeKey = effectiveAction.key || effectiveAction.params?.key || "note";
              const memorizeValue = effectiveAction.value || effectiveAction.params?.value || effectiveAction.text;
              console.log(`[Executor] Memorizing data: ${memorizeKey} = ${memorizeValue}`);
              executionResult = { success: true, message: `Memorized ${memorizeKey}` };
              
              // Ensure we write to notebook so Planner can see it in future turns
              const currentLtm = state.long_term_memory || { summary: "", offset: 0, notebook: {} };
              return {
                  total_history: [
                      ...(total_history || []),
                      {
                          step: (total_history || []).length + 1,
                          action: effectiveAction,
                          result: executionResult,
                          meta: newMetaData
                      }
                  ],
                  meta_data: newMetaData,
                  long_term_memory: {
                      ...currentLtm,
                      notebook: {
                          ...currentLtm.notebook,
                          [memorizeKey]: memorizeValue
                      }
                  }
              };
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
        // 动态等待机制 (Dynamic Stabilization)
        try {
          console.log(`[Executor] Waiting for page to stabilize...`);
          const { cdpClient } = await import("../../../drivers/cdp/index");
          
          // Inject a script to wait for network/DOM idle
          const waitScript = `
            new Promise((resolve) => {
              let idleTimeout;
              let observer;
              
              const resetIdleTimer = () => {
                clearTimeout(idleTimeout);
                idleTimeout = setTimeout(() => {
                  if (observer) observer.disconnect();
                  resolve("stabilized");
                }, 1000); // 1 second of no DOM changes means idle
              };

              // Start the timer
              resetIdleTimer();

              // Observe DOM changes
              observer = new MutationObserver(() => {
                resetIdleTimer();
              });
              
              observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
              });

              // Failsafe: resolve after max 5 seconds anyway
              setTimeout(() => {
                if (observer) observer.disconnect();
                resolve("timeout");
              }, 5000);
            });
          `;

          const result = await cdpClient.send(tabId, 'Runtime.evaluate', {
            expression: waitScript,
            awaitPromise: true,
            returnByValue: true
          });
          
          console.log(`[Executor] Stabilization finished with result: ${result?.result?.value}`);
        } catch (e) {
          console.warn(`[Executor] Dynamic wait failed, falling back to static timeout:`, e);
          await new Promise(r => setTimeout(r, 3000));
        }
        
        // 使用上下文绑定的 tabId，禁止 query active tab（多 Tab 并发时会串文）
        let currentExtractTabId = tabId;
      
        let pageText = "";
        try {
            if (currentExtractTabId) {
                // 主动重新初始化 PageAgent，确保绑定到正确的最新上下文
                const pageDriver = getPageDriver(currentExtractTabId);
                try {
                  await pageDriver.init(currentExtractTabId);
                } catch (e) {
                  console.warn(`[Executor] PageAgent init warning:`, e);
                }
                
                const url = await getTabUrlSafe(currentExtractTabId);
                
                // 提取更新后的页面内容
                try {
                  pageText = await pageDriver.getSemanticDOM();
                } catch (pageDriverErr) {
                  console.warn(`[Executor] PageAgent DOM extraction failed:`, pageDriverErr);
                  pageText = 'Failed to extract page text using PageAgent';
                }
                
                // 获取最新标题
                let pageTitle = 'Untitled';
                try {
                  const { cdpClient } = await import("../../../drivers/cdp/index");
                  const titleResult = await cdpClient.send(currentExtractTabId, 'Runtime.evaluate', {
                    expression: 'document.title || ""',
                    returnByValue: true
                  });
                  pageTitle = titleResult?.result?.value || 'Untitled';
                } catch {}
                
                console.log(`[Executor] Post-action URL: ${url} (DOM len: ${pageText.length})`);
                
                // 拼接最终的内容：如果刚才有技能执行的结果（存留在 newMetaData.page_content 里），拼在最前面
                let prefix = '';
                const existingPageContent = (newMetaData as any).page_content;
                if (existingPageContent && existingPageContent.startsWith('[Skill')) {
                  prefix = existingPageContent + '\n\n---\n\n';
                }
                
                newMetaData = {
                  ...newMetaData,
                  url: url,
                  tabId: currentExtractTabId,
                  boundTabId: currentExtractTabId,
                  page_content: `${prefix}[Title: ${pageTitle}]\n[URL: ${url}]\n\n${pageText || 'No text content found on page.'}`
                };
                
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

  // 构建 Message
  const messages = [
    new HumanMessage({
      content: `Execution Step ${stepId} Result: ${executionResult.success ? 'Success' : 'Failed'}`
    })
  ];

  console.log("--- [Executor] Execution Completed ---\n");

  // 被动捕获 Tab 状态变化 (Passive Tab Capture)
  // active_tab_id 来自上下文绑定，禁止 query active tab（多 Tab 并发时会串文）
  let active_tab_id = state.meta_data?.tab_id ?? state.active_tab_id;
  let opened_tabs = state.opened_tabs || [];
  if (typeof chrome !== "undefined" && chrome.tabs) {
    try {
      const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
        chrome.tabs.query({}, resolve);
      });
      opened_tabs = tabs.map(t => ({
        tabId: t.id!,
        title: t.title || "Untitled",
        url: t.url || ""
      }));
    } catch (e) {
      console.warn("[Executor] Failed to capture tab states:", e);
    }
  }

  const returnPayload: Partial<AgentState> = {
    total_history: updatedHistory,
    screenshot: newScreenshot,
    messages: messages,
    active_tab_id,
    opened_tabs,
    // finish 在 Executor 落地为真正终态；普通执行失败先交给 Watchdog/Cortex 评估是否可恢复
    status:
      action.type === "finish"
        ? "FINISHED"
        : executionResult.success
          ? state.status
          : "RUNNING",
    error: executionResult.success ? (state.error || null) : (executionResult.error || state.error || "Executor step failed"),
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
