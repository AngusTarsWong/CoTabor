import 'dotenv/config';
import * as http from 'http';
import * as url from 'url';
import { exec } from 'child_process';
import { ENV } from '../src/shared/constants/env';
import { LarkAuthManager, LarkTokenSession } from '../src/shared/utils/lark-auth';

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/auth`;

async function getAccessTokenFromCode(code: string): Promise<LarkTokenSession> {
  const appId = ENV.LARK_APP_ID;
  const appSecret = ENV.LARK_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("LARK_CONFIG_MISSING: 请先在 .env 中设置 VITE_LARK_APP_ID 和 VITE_LARK_APP_SECRET");
  }

  // 1. 获取 App Access Token
  const appTokenRes = await fetch("https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret })
  });
  const { app_access_token } = await appTokenRes.json() as any;

  // 2. 用 code 换取 user_access_token
  const tokenRes = await fetch("https://open.feishu.cn/open-apis/authen/v1/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${app_access_token}`
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: code
    })
  });

  const data: any = await tokenRes.json();
  if (data.code !== 0) {
    throw new Error(`换取 Token 失败: ${data.msg} (Code: ${data.code})`);
  }

  return {
    access_token: data.data.access_token,
    refresh_token: data.data.refresh_token,
    expires_at: Date.now() + (data.data.expires_in * 1000),
    refresh_expires_at: Date.now() + (data.data.refresh_expires_in * 1000),
    user_name: data.data.name || "飞书用户"
  };
}

async function startLogin() {
  const appId = ENV.LARK_APP_ID;
  if (!appId) {
    console.error("❌ 错误: .env 中未配置 VITE_LARK_APP_ID");
    process.exit(1);
  }

  // 构建授权 URL
  // 包含基础权限及文档权限
  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/index?app_id=${appId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=cotabor_auth`;

  console.log('==========================================');
  console.log('🔐 CoTabor 飞书个人身份授权引导');
  console.log('==========================================\n');
  console.log('⏳ 正在启动本地授权回调服务器...');

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '', true);

    if (parsedUrl.pathname === '/auth') {
      const code = parsedUrl.query.code as string;

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>授权失败</h1><p>未获取到 code 凭证。</p>');
        return;
      }

      console.log('✅ 已收到授权码，正在换取永久凭证...');
      try {
        const session = await getAccessTokenFromCode(code);
        LarkAuthManager.getInstance().saveSession(session);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <div style="text-align: center; font-family: sans-serif; padding: 50px;">
            <h1 style="color: #4CAF50;">🎉 授权成功！</h1>
            <p>你好，<b>${session.user_name}</b>。CoTabor 现在已获得你的个人身份授权。</p>
            <p>该授权将支持 30 天自动续期。你可以关闭此窗口回终端继续操作了。</p>
          </div>
        `);

        console.log(`\n🏆 登录成功！欢迎回来，${session.user_name}。`);
        console.log('------------------------------------------');
        console.log('你可以开始运行 test-feishu-skill.ts 来验证了。');

        // 延迟关闭服务器，让页面能渲染出来
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);

      } catch (err: any) {
        console.error('❌ 授权过程出错:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>授权过程出错</h1><p>${err.message}</p>`);
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(PORT, () => {
    console.log(`📡 监听地址: http://localhost:${PORT}`);
    console.log(`🔗 正在自动打开浏览器进行扫码授权...`);

    // 打开浏览器 (Mac)
    exec(`open "${authUrl}"`);

    console.log('\n(若浏览器未自动打开，请点击此链接手动授权:');
    console.log(authUrl + '\n');
  });
}

startLogin().catch(console.error);
