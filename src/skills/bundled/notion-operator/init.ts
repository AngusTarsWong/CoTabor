import { NotionBackendConfig } from "../../../shared/types/operator";

const NOTION_VERSION = "2022-06-28";
const BASE_URL = "https://api.notion.com/v1";

export interface NotionInitConfig {
  apiKey: string;
  parentPageId: string; // Notion page ID (UUID, with or without dashes)
}

export interface NotionPageOption {
  id: string;
  title: string;
  url: string;
  lastEditedTime?: string;
}

/**
 * Extract the Notion page ID from a Notion URL or raw ID string.
 * Handles formats like:
 *   https://notion.so/My-Page-abc123def456789012345678901234ab
 *   https://www.notion.so/workspace/abc123def456789012345678901234ab?pvs=4
 *   abc123def456789012345678901234ab   (already a UUID)
 */
export function extractNotionPageId(input: string): string {
  if (!input.includes("notion")) {
    // Assume it's already a raw ID; strip dashes
    return input.replace(/-/g, "");
  }
  // Match a 32-hex-char block at the end of the URL path (before ? or #)
  const match = input.match(/([0-9a-f]{32})(?:[?#]|$)/i)
    ?? input.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[?#]|$)/i);
  if (match) return match[1].replace(/-/g, "");
  throw new Error("Cannot extract Notion page ID from the provided URL. Make sure the URL contains a valid page ID.");
}

/** Shared fetch helper. */
async function notionFetch(apiKey: string, method: string, endpoint: string, body?: object): Promise<any> {
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
    throw new Error(err.message ?? res.statusText);
  }
  return res.json();
}

function extractPageTitle(page: any): string {
  const properties = page?.properties ?? {};
  for (const prop of Object.values(properties) as any[]) {
    if (Array.isArray(prop?.title) && prop.title.length > 0) {
      return prop.title.map((item: any) => item?.plain_text ?? "").join("").trim() || "未命名页面";
    }
  }
  return "未命名页面";
}

/**
 * Search accessible Notion pages for the current integration token.
 * This is used by the options UI so users can pick a parent page instead of pasting a URL.
 */
export async function searchAccessibleNotionPages(
  apiKey: string,
  query = "",
  pageSize = 20
): Promise<NotionPageOption[]> {
  const data = await notionFetch(apiKey, "POST", "/search", {
    query,
    page_size: pageSize,
    sort: {
      direction: "descending",
      timestamp: "last_edited_time",
    },
    filter: {
      property: "object",
      value: "page",
    },
  });

  return (data.results ?? []).map((page: any) => ({
    id: String(page.id ?? "").replace(/-/g, ""),
    title: extractPageTitle(page),
    url: page.url ?? "",
    lastEditedTime: page.last_edited_time,
  })).filter((page: NotionPageOption) => page.id && page.url);
}

/**
 * Format a raw 32-char Notion ID into the dashed UUID format the API requires.
 */
function formatId(raw: string): string {
  const id = raw.replace(/-/g, "");
  return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/**
 * Search for child databases of a page by title.
 * Returns a map of { title → databaseId (no dashes) }.
 */
async function listChildDatabases(apiKey: string, pageId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  let startCursor: string | undefined = undefined;

  // Paginate through all child blocks
  while (true) {
    const url = `/blocks/${formatId(pageId)}/children` + (startCursor ? `?start_cursor=${startCursor}` : "");
    const data: any = await notionFetch(apiKey, "GET", url);

    for (const block of data.results ?? []) {
      if (block.type === "child_database") {
        const dbTitle: string = block.child_database?.title ?? "";
        const dbId: string = (block.id as string).replace(/-/g, "");
        found.set(dbTitle, dbId);
      }
    }

    if (!data.has_more) break;
    startCursor = data.next_cursor;
  }

  return found;
}

/** Create a Notion database under a parent page with the given property schema. */
async function createDatabase(
  apiKey: string,
  parentPageId: string,
  title: string,
  properties: Record<string, any>
): Promise<string> {
  const data = await notionFetch(apiKey, "POST", "/databases", {
    parent:     { type: "page_id", page_id: formatId(parentPageId) },
    title:      [{ text: { content: title } }],
    properties,
  });

  // Notion returns IDs with dashes; strip them for consistent storage
  return (data.id as string).replace(/-/g, "");
}

/**
 * Ensure a database with the given title exists under the parent page.
 * If it already exists, the existing database ID is returned (idempotent).
 * If it does not exist, a new one is created.
 */
async function ensureDatabase(
  apiKey: string,
  parentPageId: string,
  title: string,
  properties: Record<string, any>,
  existingDbs: Map<string, string>
): Promise<{ id: string; created: boolean }> {
  const existing = existingDbs.get(title);
  if (existing) {
    console.log(`[InitNotion] ♻️  Reusing existing database "${title}":`, existing);
    return { id: existing, created: false };
  }

  const id = await createDatabase(apiKey, parentPageId, title, properties);
  console.log(`[InitNotion] ✅ Created new database "${title}":`, id);
  return { id, created: true };
}

// ─── Database schemas ─────────────────────────────────────────────────────────

const L1_SCHEMA = {
  id:               { title: {} },
  domain:           { rich_text: {} },
  pathPattern:      { rich_text: {} },
  elementSelector:  { rich_text: {} },
  actionType:       { rich_text: {} },
  physicalInstruction: { rich_text: {} },
  reason:           { rich_text: {} },
  executionCount:   { number: { format: "number" } },
  successCount:     { number: { format: "number" } },
  updatedAt:        { date: {} },
} as const;

const L2_SCHEMA = {
  id:              { title: {} },
  skillName:       { rich_text: {} },
  ruleType:        { rich_text: {} },
  contextScope:    { rich_text: {} },
  parameterRules:  { rich_text: {} },
  errorHistory:    { rich_text: {} },
  hitCount:        { number: { format: "number" } },
  successCount:    { number: { format: "number" } },
  status:          { rich_text: {} },
  updatedAt:       { date: {} },
} as const;

const L3_SCHEMA = {
  id:            { title: {} },
  title:         { rich_text: {} },
  intentQuery:   { rich_text: {} },
  taskType:      { rich_text: {} },
  domainScope:   { rich_text: {} },
  language:      { rich_text: {} },
  keywords:      { rich_text: {} },
  tacticalRules: { rich_text: {} },
  updatedAt:     { date: {} },
  usageCount:    { number: { format: "number" } },
  successCount:  { number: { format: "number" } },
} as const;

const TASK_RUNS_SCHEMA = {
  id:                 { title: {} },
  goal:               { rich_text: {} },
  status:             { rich_text: {} },
  hostUrl:            { rich_text: {} },
  hostTitle:          { rich_text: {} },
  globalSummary:      { rich_text: {} },
  traceCount:         { number: { format: "number" } },
  candidateCount:     { number: { format: "number" } },
  committedL1:        { number: { format: "number" } },
  committedL2:        { number: { format: "number" } },
  committedL3:        { number: { format: "number" } },
  droppedCount:       { number: { format: "number" } },
  localPersistStatus: { rich_text: {} },
  cloudSyncStatus:    { rich_text: {} },
  cloudSyncError:     { rich_text: {} },
  startedAt:          { date: {} },
  finishedAt:         { date: {} },
  experienceStartedAt:{ date: {} },
  experienceFinishedAt:{ date: {} },
  syncedAt:           { date: {} },
  updatedAt:          { date: {} },
} as const;

const RAW_TRACES_SCHEMA = {
  id:            { title: {} },
  taskRunId:     { rich_text: {} },
  stepIndex:     { number: { format: "number" } },
  nodeName:      { rich_text: {} },
  actionType:    { rich_text: {} },
  skillName:     { rich_text: {} },
  success:       { rich_text: {} },
  url:           { rich_text: {} },
  domain:        { rich_text: {} },
  path:          { rich_text: {} },
  pageTitle:     { rich_text: {} },
  stepSummary:   { rich_text: {} },
  errorMessage:  { rich_text: {} },
  memoryLevels:  { rich_text: {} },
  memoryIds:     { rich_text: {} },
  memoryTitles:  { rich_text: {} },
  syncStatus:    { rich_text: {} },
  syncError:     { rich_text: {} },
  syncRetryCount:{ number: { format: "number" } },
  lastSyncAttemptAt: { date: {} },
  timestamp:     { date: {} },
  syncedAt:      { date: {} },
  updatedAt:     { date: {} },
} as const;

const DB_TITLE_L1 = "CoTabor_L1_MuscleMemory";
const DB_TITLE_L2 = "CoTabor_L2_SkillMemory";
const DB_TITLE_L3 = "CoTabor_L3_TacticalMemory";
const DB_TITLE_TASK_RUNS = "CoTabor_TaskRuns";
const DB_TITLE_RAW_TRACES = "CoTabor_RawTraces";

/**
 * Initialize the CoTabor Brain Base in Notion.
 *
 * Idempotent: if a database with the expected title already exists under
 * the parent page, it is reused instead of creating a duplicate.
 *
 * Steps performed automatically:
 *  1. List all child databases of the parent page
 *  2. For each of L1 / L2 / L3 / TaskRuns / RawTraces — reuse if found, create if missing
 *  3. Return the NotionBackendConfig with all database IDs
 */
export async function initializeNotionBrainBase(config: NotionInitConfig): Promise<NotionBackendConfig> {
  const { apiKey, parentPageId } = config;
  console.log("[InitNotion] Starting idempotent init under page:", parentPageId);

  // Step 1: discover existing child databases
  let existingDbs: Map<string, string>;
  try {
    existingDbs = await listChildDatabases(apiKey, parentPageId);
    console.log(`[InitNotion] Found ${existingDbs.size} existing child database(s):`, [...existingDbs.keys()]);
  } catch (e: any) {
    // If we can't list children, the integration likely lacks access to the page.
    throw new Error(
      `无法读取 Notion 页面内容 (${e.message})。\n` +
      `请确保：\n` +
      `① OAuth 授权时已选中包含该页面的工作区\n` +
      `② 若使用手动 Token，请在页面右上角「…」→「连接」中添加你的 Integration`
    );
  }

  // Step 2: ensure L1 / L2 / L3 / TaskRuns / RawTraces
  const [l1, l2, l3, taskRuns, rawTraces] = await Promise.all([
    ensureDatabase(apiKey, parentPageId, DB_TITLE_L1, L1_SCHEMA, existingDbs),
    ensureDatabase(apiKey, parentPageId, DB_TITLE_L2, L2_SCHEMA, existingDbs),
    ensureDatabase(apiKey, parentPageId, DB_TITLE_L3, L3_SCHEMA, existingDbs),
    ensureDatabase(apiKey, parentPageId, DB_TITLE_TASK_RUNS, TASK_RUNS_SCHEMA, existingDbs),
    ensureDatabase(apiKey, parentPageId, DB_TITLE_RAW_TRACES, RAW_TRACES_SCHEMA, existingDbs),
  ]);

  const summary = [
    l1.created ? `L1 新建` : `L1 复用`,
    l2.created ? `L2 新建` : `L2 复用`,
    l3.created ? `L3 新建` : `L3 复用`,
    taskRuns.created ? `TaskRuns 新建` : `TaskRuns 复用`,
    rawTraces.created ? `RawTraces 新建` : `RawTraces 复用`,
  ].join(" · ");
  console.log(`[InitNotion] Done — ${summary}`);

  return {
    type:     "notion",
    tableIds: { L1: l1.id, L2: l2.id, L3: l3.id },
    taskTableIds: { TaskRuns: taskRuns.id, RawTraces: rawTraces.id },
  };
}
