import "dotenv/config";
import { FeishuTableOperator } from "../src/skills/bundled/feishu-operator/api";

async function runFeishuTest() {
  console.log("🚀 Starting Feishu Bitable API Test...\n");

  const appId = process.env.VITE_LARK_APP_ID;
  const appSecret = process.env.VITE_LARK_APP_SECRET;
  const folderToken = process.env.VITE_LARK_TASKS_FOLDER;

  if (!appId || !appSecret) {
    throw new Error("Missing VITE_LARK_APP_ID or VITE_LARK_APP_SECRET in .env");
  }

  // Initialize operator without appToken first
  const operator = new FeishuTableOperator({
    appId,
    appSecret,
    appToken: "", // Will be filled after creation
    tableIds: { L1: "", L2: "", L3: "" }
  });

  try {
    // 1. Create a Bitable App
    console.log("--- 1. Creating Bitable App ---");
    const appName = `CoTabor Test Bitable ${Date.now()}`;
    const newApp = await operator.createBitableApp(appName, folderToken);
    console.log(`✅ Created Bitable App: ${newApp.name}`);
    console.log(`🔗 URL: ${newApp.url}`);
    console.log(`🔑 AppToken: ${newApp.app_token}\n`);

    // Set the appToken for subsequent requests
    operator.config.appToken = newApp.app_token;

    // 2. List default tables
    console.log("--- 2. Listing Tables ---");
    const tablesRes = await operator.getTables();
    let tableId = tablesRes.items[0].table_id;
    console.log(`✅ Found ${tablesRes.items.length} default table(s). Primary Table ID: ${tableId}\n`);

    // 3. Create a new custom table
    console.log("--- 3. Creating Custom Table ---");
    const newTableRes = await operator.createTable("L1 Memory", {
      field_name: "id",
      type: 1 // Text
    });
    tableId = newTableRes.table_id;
    console.log(`✅ Created Custom Table 'L1 Memory' with Table ID: ${tableId}\n`);

    // 3.1 Create additional fields for the new table
    console.log("--- 3.1 Adding Fields to Table ---");
    await operator.request("POST", `/tables/${tableId}/fields`, { field_name: "content", type: 1 });
    await operator.request("POST", `/tables/${tableId}/fields`, { field_name: "status", type: 1 });
    console.log(`✅ Added 'content' and 'status' fields\n`);

    // 4. Create a record
    console.log("--- 4. Creating Record ---");
    const recordFields = {
      id: "test_custom_id_123",
      content: "This is a test record created by CoTabor API Test script",
      status: "pending"
    };
    const createRes = await operator.createRecord(tableId, recordFields);
    console.log(`✅ Created Record:`, createRes.record);
    console.log("");

    // 5. Update the record
    console.log("--- 5. Updating Record ---");
    const updateFields = {
      id: "test_custom_id_123", // Must include the custom ID to find it
      content: "This record has been UPDATED by CoTabor API Test script",
      status: "completed"
    };
    const updateRes = await operator.updateRecordByCustomId(tableId, "test_custom_id_123", updateFields);
    console.log(`✅ Updated Record:`, updateRes.record);
    console.log("");

    // 6. Search for the record
    console.log("--- 6. Searching Record ---");
    const searchRes = await operator.searchRecords(tableId, {
      conjunction: "and",
      conditions: [{ field_name: "id", operator: "is", value: ["test_custom_id_123"] }]
    });
    console.log(`✅ Search Results Found: ${searchRes.items.length} item(s)`);
    console.log(searchRes.items[0]);
    console.log("");

    console.log("🎉 All Feishu Bitable API tests completed successfully!");
    console.log(`👉 Please verify the result in your browser: ${newApp.url}`);

  } catch (error: any) {
    console.error("❌ Feishu API Test Failed:", error.message);
    if (error.stack) console.error(error.stack);
  }
}

runFeishuTest();
