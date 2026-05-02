import { getPageDriver } from "../../drivers/page";
import { log } from "../../shared/utils/log";

const DOM_IDLE_WAIT_MS = 1000;
const DOM_MAX_WAIT_MS = 5000;
const STATIC_FALLBACK_MS = 3000;

const STABILIZE_SCRIPT = `
new Promise((resolve) => {
  let idleTimeout;
  let observer;
  const resetIdleTimer = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      if (observer) observer.disconnect();
      resolve("stabilized");
    }, ${DOM_IDLE_WAIT_MS});
  };
  resetIdleTimer();
  observer = new MutationObserver(() => { resetIdleTimer(); });
  observer.observe(document.body || document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });
  setTimeout(() => {
    if (observer) observer.disconnect();
    resolve("timeout");
  }, ${DOM_MAX_WAIT_MS});
});
`;

export interface PageSnapshot {
  url: string;
  title: string;
  pageContent: string;
}

/**
 * Waits for the page to stabilize after an action, then extracts the updated DOM snapshot.
 */
export async function stabilizeAndCapturePage(tabId: number): Promise<PageSnapshot> {
  // Dynamic wait: observe DOM mutations until idle
  try {
    const { cdpClient } = await import("../../drivers/cdp/index");
    const result = await cdpClient.send(tabId, "Runtime.evaluate", {
      expression: STABILIZE_SCRIPT,
      awaitPromise: true,
      returnByValue: true,
    });
    log.info("PageStabilizer", `Stabilized: ${result?.result?.value}`);
  } catch (e) {
    log.warn("PageStabilizer", "Dynamic wait failed, using static fallback:", e);
    await new Promise((r) => setTimeout(r, STATIC_FALLBACK_MS));
  }

  const { cdpClient } = await import("../../drivers/cdp/index");

  // Extract URL
  let url = "";
  try {
    const urlResult = await cdpClient.send(tabId, "Runtime.evaluate", {
      expression: "window.location.href",
      returnByValue: true,
    });
    url = urlResult?.result?.value || "";
  } catch {}

  // Extract title
  let title = "Untitled";
  try {
    const titleResult = await cdpClient.send(tabId, "Runtime.evaluate", {
      expression: 'document.title || ""',
      returnByValue: true,
    });
    title = titleResult?.result?.value || "Untitled";
  } catch {}

  // Extract semantic DOM
  let pageContent = "No text content found on page.";
  try {
    const pageDriver = getPageDriver(tabId);
    try {
      await pageDriver.init(tabId);
    } catch {}
    pageContent = await pageDriver.getSemanticDOM();
  } catch (e) {
    log.warn("PageStabilizer", "DOM extraction failed:", e);
    pageContent = "Failed to extract page text using PageAgent";
  }

  log.info("PageStabilizer", `Post-action URL: ${url} (DOM len: ${pageContent.length})`);

  return {
    url,
    title,
    pageContent: `[Title: ${title}]\n[URL: ${url}]\n\n${pageContent}`,
  };
}
