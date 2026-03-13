/**
 * DOM Perception Module
 * Scans the page for interactive elements.
 */

export interface ElementInfo {
  id: number;
  tagName: string;
  text: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  attributes: Record<string, string>;
  interactive: boolean;
}

/**
 * The script to be injected into the page.
 * It must be a self-contained function with no external dependencies.
 */
function scanPage() {
  let counter = 1;
  const elements: any[] = [];

  // Helper to check visibility
  function isVisible(el: HTMLElement) {
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  // Select potential interactive elements
  const selector = [
    "button",
    "a[href]",
    "input:not([type=hidden])",
    "select",
    "textarea",
    "[role=button]",
    "[role=link]",
    "[onclick]",
  ].join(",");

  const nodes = document.querySelectorAll(selector);

  nodes.forEach((node) => {
    const el = node as HTMLElement;
    if (!isVisible(el)) return;

    const rect = el.getBoundingClientRect();
    
    // Filter out tiny elements (likely invisible or tracking pixels)
    if (rect.width < 5 || rect.height < 5) return;

    // Get useful attributes
    const attributes: Record<string, string> = {};
    if (el.id) attributes.id = el.id;
    if (el.getAttribute("name")) attributes.name = el.getAttribute("name") || "";
    if (el.getAttribute("type")) attributes.type = el.getAttribute("type") || "";
    if (el.getAttribute("aria-label")) attributes["aria-label"] = el.getAttribute("aria-label") || "";
    if (el.getAttribute("placeholder")) attributes.placeholder = el.getAttribute("placeholder") || "";
    if (el.tagName === "A" && el.getAttribute("href")) attributes.href = el.getAttribute("href") || "";

    // Get text content (simplified)
    const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 100);

    elements.push({
      id: counter++,
      tagName: el.tagName.toLowerCase(),
      text,
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      attributes,
      interactive: true,
    });
  });

  return elements;
}

export const dom = {
  /**
   * Scan the current page for interactive elements.
   */
  scan: async (tabId: number): Promise<ElementInfo[]> => {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanPage,
    });

    if (result && result[0] && result[0].result) {
      return result[0].result as ElementInfo[];
    }
    return [];
  },
};
