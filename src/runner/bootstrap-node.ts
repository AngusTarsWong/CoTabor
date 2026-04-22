/**
 * Node.js runtime bootstrap for CoTabor agent scripts.
 *
 * Import this module FIRST in any script (before any src/ imports that touch
 * IndexedDB or chrome.storage) to set up all polyfills and adapters.
 *
 * Usage:
 *   import { bootstrapNode } from '../src/runner/bootstrap-node';
 *   const runtime = await bootstrapNode();
 *   const agent = runtime.createAgent({ goal: '...' });
 *   await agent.start();
 *   await runtime.syncMemory();
 *   await runtime.cleanup();
 */

import "dotenv/config";
import "fake-indexeddb/auto";

// requestAnimationFrame polyfill (needed by some LangGraph internals)
if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import puppeteer, { Browser, Page, CDPSession } from "puppeteer-core";
import { setCdpClient, CdpClient } from "../drivers/cdp/index";
import { setStorageAdapter, NodeStorageAdapter } from "./storage-adapter";
import { createSyncBackend } from "../memory/sync/backend-factory";
import { syncPendingTaskRuns } from "../memory/task-commit/task-run-sync";
import { ClawAgent } from "../lib/claw/agent";
import { ExperienceJobScheduler } from "../memory/experience-job/scheduler";
import { experienceJobEventTarget } from "../memory/experience-job/events";
import type { AgentRuntime, CreateAgentConfig } from "./types";

// Inject Node.js storage adapter so BackendFactory reads from process.env
setStorageAdapter(new NodeStorageAdapter());

class PuppeteerCdpAdapter implements CdpClient {
  constructor(private session: CDPSession, private virtualTabId: number) {}

  async attach(_tabId: number) {}

  async detach(_tabId: number) {
    try {
      await this.session.detach();
    } catch {}
  }

  async send<Req = any, Res = any>(
    _tabId: number,
    method: string,
    params?: Req
  ): Promise<Res> {
    return this.session.send(method as any, params as any) as Promise<Res>;
  }
}

export interface BootstrapOptions {
  /** Path to Chrome executable. Defaults to CHROME_EXECUTABLE_PATH env var. */
  chromeExecutable?: string;
  headless?: boolean;
  /** Remote debugging port to try connecting to first. Default: 9222 */
  debugPort?: number;
}

/** Wait for the currently-running experience job to finish (max 5 min). */
async function waitForExperienceJob(taskRunId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5 * 60 * 1000);

    const handler = (e: Event) => {
      const event = (e as CustomEvent).detail;
      if (
        event.taskRunId === taskRunId &&
        (event.type === "completed" || event.type === "failed")
      ) {
        clearTimeout(timeout);
        experienceJobEventTarget.removeEventListener("experience-job", handler);
        resolve();
      }
    };

    experienceJobEventTarget.addEventListener("experience-job", handler);
  });
}

/**
 * Bootstrap a Node.js Agent runtime.
 *
 * Tries to connect to an existing Chrome on debugPort first; falls back to
 * launching a new instance using chromeExecutable.
 */
export async function bootstrapNode(
  options: BootstrapOptions = {}
): Promise<AgentRuntime> {
  const {
    chromeExecutable =
      process.env.CHROME_EXECUTABLE_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless = false,
    debugPort = 9222,
  } = options;

  const VIRTUAL_TAB_ID = 999999;

  let browser: Browser;
  let page: Page;

  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${debugPort}`,
      defaultViewport: null,
    });
    const pages = await browser.pages();
    page =
      pages.find((p) => p.url() !== "about:blank") ||
      pages[0] ||
      (await browser.newPage());
    console.log("[bootstrap] Connected to existing Chrome.");
  } catch {
    browser = await puppeteer.launch({
      headless,
      executablePath: chromeExecutable,
      defaultViewport: null,
      args: ["--start-maximized", "--no-sandbox"],
    });
    page = await browser.newPage();
    console.log("[bootstrap] Launched new Chrome.");
  }

  const session: CDPSession = await page.createCDPSession();
  setCdpClient(new PuppeteerCdpAdapter(session, VIRTUAL_TAB_ID) as any);

  const scheduler = new ExperienceJobScheduler();

  const runtime: AgentRuntime = {
    tabId: VIRTUAL_TAB_ID,
    page,

    createAgent(config: CreateAgentConfig): ClawAgent {
      return new ClawAgent({ ...config, tabId: config.tabId ?? VIRTUAL_TAB_ID });
    },

    /**
     * Schedule the experience job for the just-finished agent run, wait for it
     * to complete, then flush the sync queue to Notion/Feishu.
     *
     * @param finalState  The agent final state from the onFinish callback.
     *                    If omitted, only the sync queue is flushed.
     */
    async syncMemory(finalState?: any): Promise<void> {
      let taskRunId: string | undefined;

      if (finalState) {
        console.log("[runtime] Scheduling experience job...");
        const result = await scheduler.schedule({
          goal: finalState.request ?? "",
          finalState,
        });
        taskRunId = result.taskRunId;
        if (taskRunId) {
          console.log(
            `[runtime] Waiting for experience job ${taskRunId} to complete...`
          );
          await waitForExperienceJob(taskRunId);
          console.log("[runtime] Experience job done.");
        }
      }

      console.log("[runtime] Flushing memory to cloud...");
      const syncWorker = await createSyncBackend();
      if (!syncWorker) {
        console.warn(
          "[runtime] No sync backend found. Check STORAGE_BACKEND and VITE_NOTION_API_KEY in .env"
        );
        return;
      }

      await syncWorker.pushQueueToCloud();
      await syncPendingTaskRuns();
      console.log("[runtime] Memory sync complete.");
    },

    async cleanup(): Promise<void> {
      try {
        await browser.close();
      } catch {}
    },
  };

  return runtime;
}
