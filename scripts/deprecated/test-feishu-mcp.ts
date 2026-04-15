const APP_ID = "cli_a917f64a36385ceb";
const APP_SECRET = "GEyvGWN5sNguE1LcfWXv4iE1Bsb4nJuG";

async function runTest() {
  console.log("==========================================");
  console.log("🚀 CoTabor - 飞书 MCP 联通性测试启动");
  console.log("==========================================\n");

  // 第 1 步：获取飞书 API 调用凭证 (Tenant Access Token)
  console.log("⏳ [1/2] 正在向飞书请求 Tenant Access Token...");
  const tokenRes = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: APP_SECRET,
      }),
    }
  );

  const tokenData = await tokenRes.json();
  if (tokenData.code !== 0) {
    console.error("❌ 获取 Token 失败！请检查 App ID / App Secret 是否正确以及应用状态。");
    console.error(tokenData);
    return;
  }
  
  const tat = tokenData.tenant_access_token;
  console.log(`✅ 获取 Token 成功 (有效期: ${tokenData.expire}秒)\n`);

  // 第 2 步：直连测试（无视 NPM 依赖，直接发流抓取）
  console.log("⏳ [2/2] 正在直连飞书远程 MCP 抓取 Tools...");
  
  try {
    const mcpRes = await fetch("https://mcp.feishu.cn/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lark-MCP-TAT": tat,
        "X-Lark-MCP-Allowed-Tools": "fetch-doc,search-doc,create-doc,list-docs,get-comments"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      })
    });
    
    const mcpData = await mcpRes.json();
    if (mcpData.error) {
       console.error("❌ MCP 返回错误:", mcpData.error);
       return;
    }

    const tools = mcpData.result?.tools || [];
    console.log(`\n🎉 联通大成功！获取到 ${tools.length} 个飞书原生的大模型积木 (Tools)！\n`);
    
    tools.forEach((tool: any, index: number) => {
      console.log(`🔧 Tool [${index + 1}]: ${tool.name}`);
      console.log(`   描述: ${tool.description?.substring(0, 80).replace(/\n/g, ' ')}...`);
      const schemaKeys = Object.keys(tool.inputSchema?.properties || {});
      console.log(`   - 必填: ${tool.inputSchema?.required?.join(', ') || '无'}`);
      console.log(`   - 包含参数: ${schemaKeys.join(' | ')}\n`);
    });

  } catch (err: any) {
    console.error("❌ 获取 Tools 失败:", err.message);
  }
}

runTest();
