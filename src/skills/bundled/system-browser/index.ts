import { Skill } from "../../types";
import { DOMDriver } from "../../../drivers/dom/index";
import { CdpTools } from "../../../drivers/cdp/tools";
import { CdpInput } from "../../../drivers/cdp/input";

export const browserNavigateSkill: Skill = {
  name: "browser_navigate",
  description: "Navigate to a specific URL.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'llm_semantic' },
  params: {
    url: "string"
  },
  execute: async (params: any, context?: any) => {
    if (!context?.tabId) throw new Error("Missing tabId in context");
    if (!params.url) throw new Error("Missing url parameter");
    
    const cdpTools = new CdpTools(context.tabId);
    await cdpTools.navigate(params.url);
    return { status: "success", message: `Navigated to ${params.url}` };
  },
  getManual: async () => "Navigates the browser to the specified URL."
};

export const browserNewTabSkill: Skill = {
  name: "browser_new_tab",
  description: "Open a new tab with the specified URL.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'rule_based' },
  params: {
    url: "string (optional)"
  },
  execute: async (params: any, context?: any) => {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      const tab = await chrome.tabs.create({ url: params.url, active: true });
      return { status: "success", message: `Opened new tab`, tabId: tab.id };
    } else {
      throw new Error("chrome.tabs API not available");
    }
  },
  getManual: async () => "Opens a new browser tab and optionally navigates to a URL."
};

export const browserSwitchTabSkill: Skill = {
  name: "browser_switch_tab",
  description: "Switch to a specific tab by its tabId.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'rule_based' },
  params: {
    tabId: "number"
  },
  execute: async (params: any, context?: any) => {
    if (!params.tabId) throw new Error("Missing tabId parameter");
    if (typeof chrome !== "undefined" && chrome.tabs) {
      await chrome.tabs.update(params.tabId, { active: true });
      return { status: "success", message: `Switched to tab ${params.tabId}` };
    } else {
      throw new Error("chrome.tabs API not available");
    }
  },
  getManual: async () => "Switches focus to an existing tab using its tabId."
};

export const browserCloseTabSkill: Skill = {
  name: "browser_close_tab",
  description: "Close the current or specified tab.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'rule_based' },
  params: {
    tabId: "number (optional, defaults to current active tab)"
  },
  execute: async (params: any, context?: any) => {
    const targetTabId = params.tabId || context?.tabId;
    if (!targetTabId) throw new Error("Missing tabId to close");
    if (typeof chrome !== "undefined" && chrome.tabs) {
      await chrome.tabs.remove(targetTabId);
      return { status: "success", message: `Closed tab ${targetTabId}` };
    } else {
      throw new Error("chrome.tabs API not available");
    }
  },
  getManual: async () => "Closes a specified browser tab."
};

export const browserClickIndexSkill: Skill = {
  name: "browser_click_index",
  description: "Click on an element specified by its index.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'llm_semantic' },
  params: {
    index: "number"
  },
  execute: async (params: any, context?: any) => {
    if (!context?.tabId) throw new Error("Missing tabId in context");
    if (params.index === undefined) throw new Error("Missing index parameter");
    
    const domDriver = new DOMDriver(context.tabId);
    const { elements } = await domDriver.extractDOM();
    await domDriver.clickByIndex(elements, params.index);
    return { status: "success", message: `Clicked element at index ${params.index}` };
  },
  getManual: async () => "Clicks an element based on its DOM index."
};

export const browserTypeIndexSkill: Skill = {
  name: "browser_type_index",
  description: "Type text into an element specified by its index.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'llm_semantic' },
  params: {
    index: "number",
    text: "string"
  },
  execute: async (params: any, context?: any) => {
    if (!context?.tabId) throw new Error("Missing tabId in context");
    if (params.index === undefined) throw new Error("Missing index parameter");
    if (params.text === undefined) throw new Error("Missing text parameter");
    
    const domDriver = new DOMDriver(context.tabId);
    const { elements } = await domDriver.extractDOM();
    await domDriver.typeByIndex(elements, params.index, params.text);
    return { status: "success", message: `Typed text into element at index ${params.index}` };
  },
  getManual: async () => "Types text into an element based on its DOM index."
};

export const browserScrollSkill: Skill = {
  name: "browser_scroll",
  description: "Scroll the page vertically or horizontally.",
  role: "action",
  type: "local",
  auditConfig: { strategy: 'llm_semantic' },
  params: {
    deltaX: "number (optional, default 0)",
    deltaY: "number (optional, default 500)"
  },
  execute: async (params: any, context?: any) => {
    if (!context?.tabId) throw new Error("Missing tabId in context");
    const deltaX = params.deltaX || 0;
    const deltaY = params.deltaY || 500;
    
    const cdpInput = new CdpInput(context.tabId);
    await cdpInput.scroll(deltaX, deltaY);
    return { status: "success", message: `Scrolled page by (${deltaX}, ${deltaY})` };
  },
  getManual: async () => "Scrolls the page by the specified deltaX and deltaY values. Positive deltaY scrolls down."
};
