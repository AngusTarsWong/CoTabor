# CoTabor 项目代码审查报告（2026-04-12）

## 审查范围
- 构建与类型检查：`npm run build`、`npx tsc --noEmit`
- 记忆系统综合脚本：`npx tsx scripts/test-all.ts`
- 图编排脚本：`npx tsx src/core/graph/test.ts`
- 核心模块静态阅读：Graph 节点、技能注册、同步层、OAuth、配置层

## 高优先级问题（建议 1-3 天内修复）

1. **TypeScript 严格模式不通过（主干质量门禁缺失）**
   - 现象：`npx tsc --noEmit` 失败。
   - 影响：CI 若开启类型检查会阻塞发版，且会掩盖运行时类型问题。
   - 已定位：
     - `src/shared/utils/notion-auth.ts` 的 `launchWebAuthFlow` 返回值可能是 `undefined`，但被赋值到 `string`。
     - `src/skills/user/mcp-adapter.ts` 中 `result.content` 被 SDK 推断为 `unknown`，直接 `.filter/.map`。

2. **图测试在 Node 环境下崩溃：`indexedDB is not defined`**
   - 现象：`npx tsx src/core/graph/test.ts` 在运行中触发 `ReferenceError`。
   - 根因：`memoryStore` 在默认路径使用浏览器 IndexedDB，但测试脚本未注入 `fake-indexeddb`。
   - 影响：Graph 测试不可在本地/CI 稳定运行，导致回归覆盖不足。

3. **Watchdog 出错时默认 PASS，存在“误放行”风险**
   - 现象：LLM 审计失败（超时/异常）时返回 `PASS`。
   - 影响：失败操作可能被当成功继续推进，放大后续错误。

## 中优先级问题（建议 1-2 周内修复）

1. **Memory RAG 质量不稳定：Embedding 失败时用随机向量回退**
   - 现象：Embedding 获取失败后返回随机 2048 维向量。
   - 影响：检索结果随机化，导致“经验注入”噪声。

2. **技能执行上下文与标签页绑定存在策略冲突**
   - 现象：Executor 前面强调“不自动推断 active tab”，后面在提取阶段又 `chrome.tabs.query({ active: true })` 重定向 tab。
   - 影响：多标签复杂流程下可能把结果写回错误 tab 上下文。

3. **测试覆盖偏向脚本式 Happy Path，缺少统一测试入口**
   - 现象：根 `package.json` 没有 `test` / `lint` / `typecheck` 脚本，测试分散在 `scripts/*.ts`。
   - 影响：团队协作时很难形成稳定质量门禁。

4. **MCP 示例服务使用硬编码 Mock 数据（可能误导为真实行情）**
   - 现象：股票价格/新闻来自本地固定数据。
   - 影响：如果被误接入生产流程，会输出过期或虚构信息。

## 低优先级/架构演进建议

1. **ENV 配置层建议引入启动时校验**
   - 目前是运行时按需取值，缺少 `zod`/schema 一次性校验与错误聚合提示。

2. **Planner/Executor 的 LLM JSON 解析可统一下沉为公共函数**
   - 目前多个节点重复实现 markdown fence 清洗 + JSON.parse。

3. **`any` 与宽泛对象类型较多**
   - 长期建议给 `AgentState` 子结构、MCP tool result、CDP result 建立窄类型，减少隐式行为。

## 建议的修复路线

### Sprint A（稳定性）
- 修复 TS 报错（Notion OAuth 与 MCP Adapter 类型）。
- 为 Graph Node 测试统一注入 fake-indexeddb（或抽象 MemoryStore provider）。
- 将 Watchdog 在慢审计失败时改为 `FAIL_SAFE` 或至少 `RETRY/NEEDS_REPLAN`。

### Sprint B（质量门禁）
- 在根 `package.json` 增加：`typecheck`、`lint`、`test:smoke`、`ci:check`。
- 把 `scripts/test-all.ts` 与 graph 测试接入 CI。

### Sprint C（效果提升）
- Embedding 失败时从“随机向量”改为“空结果 + 明确降级标记”。
- 统一 tab 绑定策略（执行与提取严格使用 `boundTabId`，必要时由专门 skill 更新绑定）。

## 本次结论
项目整体方向与模块拆分较清晰，但目前的主要风险集中在：
- 类型安全门禁缺失
- Node/Extension 双环境测试断裂
- 审计失败默认放行

这三项会直接影响“可回归性 + 线上可靠性”，优先修复后再继续扩展功能更稳妥。
