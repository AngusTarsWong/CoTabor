import { LarkAuthManager } from "./lark-auth";

/**
 * 获取 Tenant Access Token
 */
export async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const data: any = await res.json();
  if (data.code !== 0) throw new Error(`Lark Auth Failed: ${data.msg}`);
  return data.tenant_access_token;
}

/**
 * 自动选择 Token (优先 UAT, 其次 TAT)
 */
export async function getLarkToken(appId: string, appSecret: string): Promise<string> {
  const authManager = LarkAuthManager.getInstance();
  if (authManager.isUserIdentityAvailable()) {
    return await authManager.getAccessToken();
  }
  return await getTenantAccessToken(appId, appSecret);
}

/**
 * 在指定文件夹中查找同名文件
 */
export async function findFileInFolder(token: string, folderToken: string, fileName: string): Promise<string | null> {
  let pageToken: string | undefined;
  
  do {
    const url = new URL("https://open.feishu.cn/open-apis/drive/v1/files");
    url.searchParams.append("folder_token", folderToken);
    if (pageToken) url.searchParams.append("page_token", pageToken);

    const res = await fetch(url.toString(), {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data: any = await res.json();
    
    if (data.code !== 0) {
      console.error(`[LarkUtils] List files failed: ${data.msg}`);
      return null;
    }

    const files = data.data?.files || [];
    const found = files.find((f: any) => f.name === fileName);
    if (found) return found.token;

    pageToken = data.data?.next_page_token;
  } while (pageToken);

  return null;
}

/**
 * 创建飞书文档
 */
export async function createDocument(token: string, folderToken: string, title: string): Promise<string> {
  const res = await fetch("https://open.feishu.cn/open-apis/docx/v1/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      folder_token: folderToken,
      title: title
    })
  });

  const data: any = await res.json();
  if (data.code !== 0) {
    throw new Error(`[LarkUtils] Create doc failed: ${data.msg}`);
  }
  return data.data.document.document_id;
}

/**
 * 追加块到文档
 */
export async function appendBlocks(token: string, documentId: string, blocks: any[]): Promise<void> {
  const chunkSize = 50;
  for (let i = 0; i < blocks.length; i += chunkSize) {
    const chunk = blocks.slice(i, i + chunkSize);
    const res = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ children: chunk })
    });

    const data: any = await res.json();
    if (data.code !== 0) {
      throw new Error(`[LarkUtils] Append blocks failed: ${data.msg}`);
    }
  }
}
