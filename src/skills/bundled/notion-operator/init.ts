import { NotionBackendConfig } from "../../../shared/types/operator";
import { initTaskLogDatabase } from "./task-log";

const NOTION_VERSION = "2022-06-28";
const BASE_URL = "https://api.notion.com/v1";

export interface NotionInitConfig {
  apiKey: string;
  parentPageId: string; // Notion page ID (UUID, with or without dashes)
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

/** Create a Notion database under a parent page with the given property schema. */
async function createDatabase(
  apiKey: string,
  parentPageId: string,
  title: string,
  properties: Record<string, any>
): Promise<string> {
  // Notion requires the page_id in the standard UUID format with dashes
  const formattedId = parentPageId.replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5"
  );

  const res = await fetch(`${BASE_URL}/databases`, {
    method: "POST",
    headers: {
      Authorization:    `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({
      parent:     { type: "page_id", page_id: formattedId },
      title:      [{ text: { content: title } }],
      properties,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Failed to create Notion database "${title}": ${err.message ?? res.statusText}`);
  }

  const data = await res.json();
  // Notion returns IDs with dashes; strip them for consistent storage
  return (data.id as string).replace(/-/g, "");
}

/**
 * Initialize the CoTabor Brain Base in Notion.
 * Creates three databases (L1, L2, L3) under the specified parent page.
 * The integration must already have access to the parent page.
 */
export async function initializeNotionBrainBase(config: NotionInitConfig): Promise<NotionBackendConfig> {
  const { apiKey, parentPageId } = config;
  console.log("[InitNotion] Creating L1/L2/L3 databases under page:", parentPageId);

  // L1 — MuscleMemory (DOM interaction rules)
  const l1Id = await createDatabase(apiKey, parentPageId, "CoTabor_L1_MuscleMemory", {
    id:               { title: {} },
    domain:           { rich_text: {} },
    pathPattern:      { rich_text: {} },
    elementSelector:  { rich_text: {} },
    actionType:       { rich_text: {} },
    physicalInstruction: { rich_text: {} },
    reason:           { rich_text: {} },
    executionCount:   { number: { format: "number" } },
    successCount:     { number: { format: "number" } },
    updatedAt:        { number: { format: "number" } },
  });
  console.log("[InitNotion] L1 database created:", l1Id);

  // L2 — SkillMemory (API parameter rules)
  const l2Id = await createDatabase(apiKey, parentPageId, "CoTabor_L2_SkillMemory", {
    id:              { title: {} },
    skillName:       { rich_text: {} },
    parameterRules:  { rich_text: {} },
    errorHistory:    { rich_text: {} },
    status:          { rich_text: {} },
    updatedAt:       { number: { format: "number" } },
  });
  console.log("[InitNotion] L2 database created:", l2Id);

  // L3 — TacticalMemory (SOP steps + embeddings)
  const l3Id = await createDatabase(apiKey, parentPageId, "CoTabor_L3_TacticalMemory", {
    id:           { title: {} },
    intentQuery:  { rich_text: {} },
    tacticalRules:{ rich_text: {} },
    // embedding is stored as a JSON-stringified rich_text (truncated to 2000 chars)
    embedding:    { rich_text: {} },
    updatedAt:    { number: { format: "number" } },
  });
  console.log("[InitNotion] L3 database created:", l3Id);

  // Create optional Task Log database (non-blocking)
  let taskLogId: string | undefined;
  try {
    taskLogId = await initTaskLogDatabase(apiKey, parentPageId);
    console.log("[InitNotion] TaskLog database created:", taskLogId);
    await chrome.storage.local.set({ notionTaskLogDbId: taskLogId });
  } catch (e) {
    console.warn("[InitNotion] TaskLog database creation failed (non-critical):", e);
  }

  return {
    type:     "notion",
    tableIds: { L1: l1Id, L2: l2Id, L3: l3Id },
  };
}
