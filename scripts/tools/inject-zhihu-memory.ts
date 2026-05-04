/**
 * inject-zhihu-memory.ts
 *
 * 手动向 IndexedDB 写入一条知乎文章列表页的 L1 经验，
 * 然后同步到 Notion，用于验证 agent 能否从记忆中吸取经验。
 *
 * 运行方式：
 *   npx tsx scripts/tools/inject-zhihu-memory.ts
 */
import "dotenv/config";
import "fake-indexeddb/auto";

if (typeof requestAnimationFrame === "undefined") {
  (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
}
if (typeof cancelAnimationFrame === "undefined") {
  (global as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
}

import { setStorageAdapter, NodeStorageAdapter } from "../../src/runner/storage-adapter";
setStorageAdapter(new NodeStorageAdapter());

import { memoryProvider, generateMemoryId } from "../../src/memory/store/memory-provider";
import { memoryStore } from "../../src/memory/store/indexeddb";
import { initialStability } from "../../src/memory/retrieval/heat";
import { createSyncBackend } from "../../src/memory/sync/backend-factory";
import type { MemoryItem, L1HintMeta, L3WorkflowMeta } from "../../src/shared/types/memory";

async function main() {
  const now = Date.now();

  // ── L1 经验：知乎 /posts 页面懒加载操作提示 ──────────────────────────────
  // L1 是"物理操作提示"，注入 Executor 的 prompt，告诉它在这个页面上怎么操作
  const l1Meta: L1HintMeta = {
    domain: "www.zhihu.com",
    pathPattern: "/people/*/posts",
    elementSelector: "article-list",
    actionType: "scroll",
    physicalInstruction:
      "知乎个人主页文章列表（/people/*/posts）为懒加载，页面初始 DOM 不含文章条目。" +
      "必须先执行 browser_scroll（向下滚动 600-800px），等待约 1 秒后再读取页面内容，" +
      "文章标题才会出现在 DOM 中。不要在滚动前就尝试提取标题，否则会得到空列表。",
    reason: "知乎文章列表懒加载，初始 DOM 仅含导航和用户信息，滚动后才渲染文章条目",
    executionCount: 3,
    successCount: 2,
  };

  const l1Item: MemoryItem = {
    id: generateMemoryId("L1_HINT"),
    type: "L1_HINT",
    content: l1Meta.physicalInstruction,
    title: "[L1] scroll @ www.zhihu.com/people/*/posts",
    tags: ["domain:www.zhihu.com"],
    stability: initialStability(),
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: l1Meta,
  };

  // ── L3 经验：知乎文章列表任务的战术规则 ──────────────────────────────────
  // L3 是"任务级策略"，注入 Planner 的 prompt，影响规划决策
  const l3Meta: L3WorkflowMeta = {
    intentQuery: "查看知乎个人主页最近发布的文章标题",
    taskType: "content_extraction",
    domainScope: "www.zhihu.com",
    language: "zh",
    keywords: ["知乎", "文章", "个人主页", "posts", "懒加载"],
    tacticalRules:
      "1. 导航到 /people/{username}/posts 后，页面文章列表为懒加载，初始不可见。" +
      "2. 必须先执行滚动（browser_scroll，distance=700）触发懒加载，再读取文章标题。" +
      "3. 如果读取到的页面内容只有导航栏和用户信息（无文章条目），说明还未滚动，需补充滚动步骤。" +
      "4. 文章标题通常在 <h2> 或带 ContentItem-title 类名的元素中。",
    memoryType: "positive",
    usageCount: 1,
    successCount: 1,
  };

  const l3Item: MemoryItem = {
    id: generateMemoryId("L3_WORKFLOW"),
    type: "L3_WORKFLOW",
    content: `查看知乎个人主页最近发布的文章标题 | ${l3Meta.tacticalRules}`,
    title: "[L3] 知乎文章列表懒加载提取策略",
    tags: ["domain:www.zhihu.com", "taskType:content_extraction"],
    stability: initialStability(),
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    meta: l3Meta,
  };

  // ── 写入 IndexedDB ────────────────────────────────────────────────────────
  console.log("[inject] Writing L1 memory item...");
  await memoryProvider.save(l1Item);
  await memoryStore.enqueueSync({
    id: `sync_${now}_l1`,
    action: "insert",
    memoryLevel: "L1",
    targetId: l1Item.id,
    payload: l1Item,
    queuedAt: now,
  });

  console.log("[inject] Writing L3 memory item...");
  await memoryProvider.save(l3Item);
  await memoryStore.enqueueSync({
    id: `sync_${now}_l3`,
    action: "insert",
    memoryLevel: "L3",
    targetId: l3Item.id,
    payload: l3Item,
    queuedAt: now,
  });

  console.log("[inject] Memory items written to IndexedDB.");
  console.log(`  L1 id: ${l1Item.id}`);
  console.log(`  L3 id: ${l3Item.id}`);

  // ── 同步到 Notion ─────────────────────────────────────────────────────────
  console.log("[inject] Connecting to sync backend...");
  const syncWorker = await createSyncBackend();
  if (!syncWorker) {
    console.warn("[inject] No sync backend configured. Check NOTION_API_KEY / NOTION_PARENT_PAGE_URL in .env");
    console.warn("[inject] Memory was written to local IndexedDB only.");
    process.exit(0);
  }

  console.log("[inject] Pushing to cloud...");
  await syncWorker.pushQueueToCloud();

  const remaining = await memoryStore.getSyncQueue();
  if (remaining.length === 0) {
    console.log("[inject] ✅ Sync complete. Both L1 and L3 memories are now in Notion.");
  } else {
    console.warn(`[inject] ⚠️  ${remaining.length} items still pending in sync queue.`);
  }

  console.log("\n[inject] Summary:");
  console.log("  L1 (Executor hint):", l1Meta.physicalInstruction.slice(0, 80) + "...");
  console.log("  L3 (Planner tactic):", l3Meta.tacticalRules.slice(0, 80) + "...");
  console.log("\nNext: run the Zhihu test to verify the agent uses these memories.");
}

main().catch((e) => {
  console.error("[inject] Fatal error:", e);
  process.exit(1);
});
