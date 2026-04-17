const NOTION_VERSION = "2022-06-28";
const BASE_URL = "https://api.notion.com/v1";

export interface TaskLogEntry {
  goal: string;
  status: 'success' | 'failed' | 'cancelled';
  stepCount: number;
  totalTokens: number;
  durationMs: number;
  summary?: string;
}

interface TaskLogDatabaseConfig {
  apiKey: string;
  databaseId: string;
}

async function notionRequest(method: string, endpoint: string, apiKey: string, body?: any): Promise<any> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization:    `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type":   "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Notion API ${method} ${endpoint} failed: ${err.message ?? res.statusText}`);
  }
  return res.json();
}

/**
 * Initialize a Task Log database under a parent page.
 * Returns the new database ID.
 */
export async function initTaskLogDatabase(apiKey: string, parentPageId: string): Promise<string> {
  const formattedId = parentPageId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const data = await notionRequest("POST", "/databases", apiKey, {
    parent: { type: "page_id", page_id: formattedId },
    title: [{ text: { content: "CoTabor_TaskLog" } }],
    properties: {
      goal:        { title: {} },
      status:      { select: { options: [
        { name: "success",   color: "green"  },
        { name: "failed",    color: "red"    },
        { name: "cancelled", color: "yellow" },
      ]}},
      stepCount:   { number: { format: "number" } },
      totalTokens: { number: { format: "number" } },
      durationMs:  { number: { format: "number" } },
      summary:     { rich_text: {} },
      timestamp:   { date: {} },
    },
  });
  return (data.id as string).replace(/-/g, "");
}

/**
 * Append a task execution record to the Task Log database.
 * Silently drops errors (non-critical path).
 */
export async function appendTaskLog(entry: TaskLogEntry): Promise<void> {
  let apiKey: string;
  let databaseId: string;

  try {
    const result = await chrome.storage.local.get(['notionApiKey', 'notionTaskLogDbId', 'storageBackend']);
    if (result.storageBackend !== 'notion') return;
    if (!result.notionApiKey || !result.notionTaskLogDbId) return;
    apiKey = result.notionApiKey;
    databaseId = result.notionTaskLogDbId;
  } catch {
    return;
  }

  const formattedDbId = databaseId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");

  try {
    await notionRequest("POST", "/pages", apiKey, {
      parent: { database_id: formattedDbId },
      properties: {
        goal:        { title: [{ text: { content: entry.goal.slice(0, 2000) } }] },
        status:      { select: { name: entry.status } },
        stepCount:   { number: entry.stepCount },
        totalTokens: { number: entry.totalTokens },
        durationMs:  { number: entry.durationMs },
        summary:     { rich_text: entry.summary ? [{ text: { content: entry.summary.slice(0, 2000) } }] : [] },
        timestamp:   { date: { start: new Date().toISOString() } },
      },
    });
    console.log(`[TaskLog] Appended task log: ${entry.goal.slice(0, 40)} (${entry.status})`);
  } catch (e) {
    console.warn("[TaskLog] Failed to append task log (non-critical):", e);
  }
}
