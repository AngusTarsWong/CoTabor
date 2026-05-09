import path from "node:path";
import fs from "node:fs";
import puppeteer from "puppeteer";

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const extDir = path.resolve(projectRoot, "dist");
  if (!fs.existsSync(extDir)) {
    console.error("[CoTabor] dist/ is missing. Run: npm run build");
    process.exit(1);
  }

  const userDataDir =
    process.env.CHROME_USER_DATA_DIR ||
    path.resolve(projectRoot, ".chrome_user_data");

  const getExecutablePath = () => {
    if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH;
    
    const platform = process.platform;
    if (platform === 'darwin') {
      return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    } else if (platform === 'linux') {
      return "/usr/bin/google-chrome";
    } else if (platform === 'win32') {
      return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }
    return undefined;
  };

  const executablePath = getExecutablePath();

  console.log("[CoTabor] Launching Chrome with extension:", extDir);
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
      "[Manual Steps]",
      "1) Click the CoTabor extension icon in the Chrome toolbar. The side panel should open automatically.",
      "2) Enter an instruction in the Agent input box inside the side panel, then click Start.",
      "3) Watch the Trace Timeline for Planner/Executor/Watchdog/Cortex events.",
      "4) To adjust debug verbosity, set VITE_DEBUG_MODE or VITE_MEDIA_CAPTURE_ON_FAIL in the environment.",
    ].join("\n")
  );

  // Keep the browser session alive for manual debugging.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("[CoTabor] Launch failed:", err);
  process.exit(1);
});
