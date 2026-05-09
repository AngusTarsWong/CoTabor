import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withTestRunner } from "../runners/base-runner";
import { ENV } from "../../../src/shared/constants/env";
import { MidsceneVisionDriver } from "../../../src/drivers/vision/midscene";

const LIVE_TIMEOUT_MS = 180_000;

function requireMidsenseConfig() {
  const config = ENV.MIDSENSE_CONFIG;
  const missing: string[] = [];

  if (!config.apiKey) missing.push("VITE_MIDSENSE_API_KEY");
  if (!config.model) missing.push("VITE_MIDSENSE_MODEL");
  if (!config.modelFamily) missing.push("VITE_MIDSENSE_MODEL_FAMILY");

  if (missing.length > 0) {
    assert.fail(`Missing Midscene live test config: ${missing.join(", ")}`);
  }

  return config;
}

function buildFixtureHtml(): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Midscene Vision Live Fixture</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
      }
      main {
        width: 720px;
        padding: 40px;
        border: 1px solid #dbe4ef;
        border-radius: 12px;
        background: #fff;
      }
      h1 {
        font-size: 28px;
        margin: 0 0 20px;
      }
      .target-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 240px;
        height: 64px;
        border: 0;
        border-radius: 8px;
        background: #2563eb;
        color: white;
        font-size: 20px;
        font-weight: 700;
        cursor: pointer;
      }
      .target-button:active {
        background: #1d4ed8;
      }
      #status {
        margin-top: 24px;
        font-size: 18px;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Midscene Vision Live Test</h1>
      <p>Use visual automation to click the blue confirmation button below.</p>
      <button id="vision-target" class="target-button" onclick="document.body.dataset.clicked = 'true'; document.getElementById('status').textContent = 'clicked';">
        Confirm Vision Target
      </button>
      <div id="status">not clicked</div>
    </main>
  </body>
</html>`;
}

describe("Live: Midscene visual operation", { timeout: LIVE_TIMEOUT_MS }, () => {
  it("clicks a local visual target through the real Midscene model", async () => {
    const midsenseConfig = requireMidsenseConfig();

    await withTestRunner("midsense-vision", async (runner, runtime) => {
      assert.ok(runtime.page, "Node runtime should expose a Puppeteer page");

      await runtime.page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      await runtime.page.setContent(buildFixtureHtml(), { waitUntil: "domcontentloaded" });

      runner.logEvent("config", `model=${midsenseConfig.model}; family=${midsenseConfig.modelFamily}; baseUrl=${midsenseConfig.baseUrl || "default"}`);
      runner.logEvent("phase", "Starting Midscene visual click action");

      const driver = new MidsceneVisionDriver();
      try {
        await driver.init({
          type: "puppeteer",
          page: runtime.page,
          midsenseConfig,
        });

        const actionResult = await driver.executeAction({
          instruction: "Click the blue button labeled 'Confirm Vision Target'.",
          context: {
            expectedVisibleText: "Confirm Vision Target",
            expectedResult: "The status text changes to clicked.",
          },
        });

        const clicked = await runtime.page.evaluate(() => document.body.dataset.clicked === "true");
        const statusText = await runtime.page.$eval("#status", (node: Element) => node.textContent?.trim() ?? "");

        runner.logEvent("action_result", JSON.stringify(actionResult));
        runner.logEvent("dom_state", `clicked=${clicked}; status=${statusText}`);

        assert.equal(actionResult.success, true, actionResult.error || "Midscene action should succeed");
        assert.equal(clicked, true, "Midscene should click the target button");
        assert.equal(statusText, "clicked", "Click should update the page status");
      } finally {
        await driver.destroy();
      }
    }, { headless: false, closeLaunchedBrowserOnCleanup: true });
  });
});
