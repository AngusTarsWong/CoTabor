/**
 * One-time Notion setup script. Mirrors the browser extension setup action.
 *
 * The extension asks for a Parent Page URL and calls initializeNotionBrainBase()
 * to auto-create/discover all L1/L2/L3/TaskRuns/RawTraces databases.
 * This script does the exact same thing and saves the result to
 * .notion_config.local.json so that script-mode Agent runs can sync memories
 * to the same Notion workspace as the extension.
 *
 * Usage:
 *   npm run tool:init-notion
 *
 * Required .env:
 *   VITE_NOTION_API_KEY=ntn_xxx
 *   NOTION_PARENT_PAGE_URL=https://www.notion.so/My-Brain-Page-...
 */
import "dotenv/config";
import fs from "fs";
import {
  initializeNotionBrainBase,
  extractNotionPageId,
} from "../../src/skills/bundled/notion-operator/init";
import { NOTION_LOCAL_CONFIG_PATH } from "../../src/runner/storage-adapter";

const apiKey = process.env.NOTION_API_KEY ?? process.env.VITE_NOTION_API_KEY ?? "";
const parentPageUrl = process.env.NOTION_PARENT_PAGE_URL ?? "";

if (!apiKey) {
  console.error("❌ VITE_NOTION_API_KEY is not set in .env");
  process.exit(1);
}
if (!parentPageUrl) {
  console.error("❌ NOTION_PARENT_PAGE_URL is not set in .env");
  console.error("   Set it to the URL of the Notion page you want to use as the AI memory root.");
  process.exit(1);
}

const parentPageId = extractNotionPageId(parentPageUrl);
if (!parentPageId) {
  console.error(`❌ Could not extract a page ID from: ${parentPageUrl}`);
  process.exit(1);
}

console.log(`🚀 Initializing Notion AI memory under page: ${parentPageUrl}`);
console.log(`   Parent page ID: ${parentPageId}\n`);

const config = await initializeNotionBrainBase({ apiKey, parentPageId });

fs.writeFileSync(NOTION_LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

console.log("✅ Notion databases ready. Config saved to", NOTION_LOCAL_CONFIG_PATH);
console.log(JSON.stringify(config, null, 2));
console.log("\nYou can now run agent tasks and memories will sync to Notion automatically.");
