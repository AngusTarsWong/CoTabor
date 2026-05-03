/**
 * Interactive debug runner: connects to (or launches) Chrome, then runs a
 * one-shot Agent task and streams step logs to the console.
 *
 * Usage: npx tsx scripts/tools/debug-agent.ts
 *        npm run tool:debug
 */
import { bootstrapNode } from "../../src/runner/bootstrap-node";
import { formatStepLog } from "../../src/shared/utils/logger";

const runtime = await bootstrapNode({
  debugPort: 9222,
});

const agent = runtime.createAgent({
  goal: [
    "请在当前标签页完成以下端到端任务：",
    "1) 打开 Google 新闻中文页：https://news.google.com/?hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
    "2) 适度下拉页面两次以加载更多首屏要闻",
    "3) 基于页面文本生成一段 Markdown 中文摘要，格式要求：",
    "   - 标题：# Google 新闻要闻总结（YYYY-MM-DD）",
    "   - 要点：3–6 条，每条不超过 20 字，使用 \"- \" 列表项",
    "   - 在要点下方提供一小段（约 50 字）的总结评价",
    "   - 结尾附注：> 数据来源：news.google.com 首屏文本（仅作综述参考）",
    "4) 完成后将摘要打印到控制台并输出 finish",
  ].join(" "),

  onLog: (msg) => console.log(`[log] ${msg}`),

  onStep: (step) => {
    const { hasImportantInfo, logText } = formatStepLog(step);
    if (hasImportantInfo) {
      console.log(logText);
    }
  },

  onFinish: async (result) => {
    console.log("\n--- Agent Finished ---");
    console.log(result?.output ?? JSON.stringify(result, null, 2));
    await runtime.syncMemory(result?.finalState ?? result);
    await runtime.cleanup();
    process.exit(0);
  },

  onError: async (err) => {
    console.error("--- Agent Error ---", err);
    await runtime.cleanup();
    process.exit(1);
  },
});

await agent.start();
