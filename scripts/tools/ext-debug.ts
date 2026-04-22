import path from "node:path";
import fs from "node:fs";
import puppeteer from "puppeteer";

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const extDir = path.resolve(projectRoot, "dist");
  if (!fs.existsSync(extDir)) {
    console.error("[CoTabor] dist/ 不存在，请先执行: npm run build");
    process.exit(1);
  }

  const userDataDir =
    process.env.CHROME_USER_DATA_DIR ||
    path.resolve(projectRoot, ".chrome_user_data");
  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  console.log("[CoTabor] 启动 Chrome，并加载扩展:", extDir);
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    userDataDir,
    defaultViewport: null,
    args: [
      `--load-extension=${extDir}`,
      `--disable-extensions-except=${extDir}`,
      "--remote-debugging-port=9222",
      "--disable-background-networking",
    ],
  });

  const page = await browser.newPage();
  await page.goto("https://www.google.com", { waitUntil: "domcontentloaded" });

  console.log(
    [
      "【操作指引】",
      "1) 点击扩展工具栏中的 CoTabor 图标，Sidepanel 会自动打开；",
      "2) 在 Sidepanel 的 Agent 输入框手动录入指令，然后 Start；",
      "3) 观察 Trace Timeline：Planner/Executor/Watchdog/Cortex 的事件将逐步出现；",
      "4) 如需切换调试强度，可在环境变量设置 VITE_DEBUG_MODE / VITE_MEDIA_CAPTURE_ON_FAIL；",
    ].join("\n")
  );

  // 保持会话，便于人工操作
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[CoTabor] 启动失败:", err);
  process.exit(1);
});
