import { getLarkToken } from "../../../shared/utils/lark-utils";
import { FeishuTableOperator } from "./api";

export interface InitFeishuConfig {
  appId: string;
  appSecret: string;
  folderToken: string;
}

export interface FeishuDataCenterConfig {
  memoriesAppToken: string;
  memoriesTableIds: {
    L1: string;
    L2: string;
    L3: string;
  };
  logsAppToken: string;
  logsTableIds: {
    flow: string;
    steps: string;
  };
}

/**
 * Extracts folder token from a Feishu folder URL or returns the token if it's already a token.
 */
export function extractFolderToken(input: string): string {
  if (!input.includes('http')) return input;
  // Match URLs like: https://xxx.feishu.cn/drive/folder/TOKEN
  const match = input.match(/\/folder\/([a-zA-Z0-9]+)/);
  if (match && match[1]) {
    return match[1];
  }
  throw new Error("Invalid Feishu folder URL. Could not extract folder token.");
}

/**
 * Initialize the Cotabor Brain Base in a specified Feishu folder.
 */
export async function initializeBrainBase(config: InitFeishuConfig): Promise<FeishuDataCenterConfig> {
  const folderToken = extractFolderToken(config.folderToken);
  console.log(`[InitFeishu] Starting initialization in folder: ${folderToken}`);

  const operator = new FeishuTableOperator({
    appId: config.appId,
    appSecret: config.appSecret,
    appToken: "", // Will be filled dynamically
    tableIds: { L1: "", L2: "", L3: "" }
  });

  // Helper to add fields to a table
  const addField = async (appToken: string, tableId: string, fieldName: string, type: number) => {
    operator.config.appToken = appToken;
    await operator.request("POST", `/tables/${tableId}/fields`, { field_name: fieldName, type });
  };

  // ==========================================
  // 1. Create Memories Bitable
  // ==========================================
  console.log("[InitFeishu] Creating Memories Bitable...");
  const memoriesApp = await operator.createBitableApp("Cotabor_Memories", folderToken);
  const memAppToken = memoriesApp.app_token;

  operator.config.appToken = memAppToken;
  // Feishu automatically creates a default table, let's get it and rename it to L1
  const memTables = await operator.getTables();
  const defaultTableId = memTables.items[0].table_id;
  
  // Note: Bitable API doesn't support renaming table easily via simple endpoint, 
  // so we just create new ones and we can ignore the default one, or we use the default one as L1.
  // For simplicity, we'll create new ones.
  console.log("[InitFeishu] Creating L1, L2, L3 tables...");
  
  // L1
  const l1TableRes = await operator.createTable("L1_全局规则", { field_name: "id", type: 1 });
  const l1Id = l1TableRes.table_id;
  await addField(memAppToken, l1Id, "content", 1);
  await addField(memAppToken, l1Id, "status", 1);
  await addField(memAppToken, l1Id, "updatedAt", 1);

  // L2
  const l2TableRes = await operator.createTable("L2_项目规范", { field_name: "id", type: 1 });
  const l2Id = l2TableRes.table_id;
  await addField(memAppToken, l2Id, "scope", 1);
  await addField(memAppToken, l2Id, "content", 1);
  await addField(memAppToken, l2Id, "status", 1);
  await addField(memAppToken, l2Id, "updatedAt", 1);

  // L3
  const l3TableRes = await operator.createTable("L3_操作SOP", { field_name: "id", type: 1 });
  const l3Id = l3TableRes.table_id;
  await addField(memAppToken, l3Id, "memoryTitle", 1);
  await addField(memAppToken, l3Id, "intentQuery", 1);
  await addField(memAppToken, l3Id, "tacticalRules", 1);
  await addField(memAppToken, l3Id, "taskType", 1);
  await addField(memAppToken, l3Id, "domainScope", 1);
  await addField(memAppToken, l3Id, "language", 1);
  await addField(memAppToken, l3Id, "keywords", 1);
  await addField(memAppToken, l3Id, "updatedAt", 1);

  // ==========================================
  // 2. Create Logs Bitable
  // ==========================================
  console.log("[InitFeishu] Creating Logs Bitable...");
  operator.config.appToken = ""; // Clear to create app
  const logsApp = await operator.createBitableApp("Cotabor_Logs", folderToken);
  const logsAppToken = logsApp.app_token;
  operator.config.appToken = logsAppToken;

  console.log("[InitFeishu] Creating Flow and Steps tables...");
  
  // Flow Table
  const flowTableRes = await operator.createTable("任务执行流", { field_name: "taskId", type: 1 });
  const flowId = flowTableRes.table_id;
  await addField(logsAppToken, flowId, "startTime", 1);
  await addField(logsAppToken, flowId, "endTime", 1);
  await addField(logsAppToken, flowId, "status", 1);

  // Steps Table
  const stepsTableRes = await operator.createTable("详细操作步", { field_name: "taskId", type: 1 });
  const stepsId = stepsTableRes.table_id;
  await addField(logsAppToken, stepsId, "stepIndex", 2); // 2 is Number type
  await addField(logsAppToken, stepsId, "action", 1);
  await addField(logsAppToken, stepsId, "screenshotUrl", 1); // For simplicity, storing URL.

  console.log("[InitFeishu] Initialization Complete!");

  return {
    memoriesAppToken: memAppToken,
    memoriesTableIds: {
      L1: l1Id,
      L2: l2Id,
      L3: l3Id
    },
    logsAppToken: logsAppToken,
    logsTableIds: {
      flow: flowId,
      steps: stepsId
    }
  };
}
