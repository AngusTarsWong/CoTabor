# 访问 TAPD 首页（Plan Mode 计划）

## Summary（摘要）
目标：使用集成浏览器（MCP `integrated_browser`）打开标准 TAPD 域名 **https://www.tapd.cn/**，**仅停留在首页/登录页**进行确认；如出现登录/验证码，**暂停并等待用户手动完成**，不代替用户输入账号信息。

## Current State Analysis（现状分析）
1. 当前处于 **Plan Mode**：只能做只读分析与编写本计划文件；暂不实际调用浏览器工具执行访问。
2. 环境已启用 MCP 服务器：`integrated_browser`，提供浏览器自动化工具（如 `browser_navigate`、`browser_snapshot`、`browser_take_screenshot` 等）。
3. 项目内也存在“本地浏览器技能”示例，可参考其参数 schema 形态（例如只需要 `{ url: string }` 的 `browser_navigate`），但本任务执行以 MCP `integrated_browser` 为准。

## Proposed Changes（实施方案：步骤与工具调用）
> 执行阶段严格遵循：**先读取 MCP 工具 schema** → **再调用 MCP 工具**。所有 MCP 调用都通过 `run_mcp`，且参数放在 `args` 中。

### 1) 读取 MCP 工具 schema（必须）
1. 使用 `LS` 列出 MCP `integrated_browser` 的 tools 描述文件目录：
   - `/mnt/appuserdata/mcps/s_workspace-9e0f1345/solo_work_lite/integrated_browser/tools/`
2. 使用 `Read` 打开并确认下列工具的 schema（至少）：
   - `browser_tabs`
   - `browser_lock` / `browser_unlock`
   - `browser_navigate`
   - `browser_wait_for`
   - `browser_snapshot`
   - `browser_take_screenshot`
   - （可选排障）`browser_console_messages`、`browser_network_requests`
3. 从 schema 中确认每个工具的必填字段与字段名（例如 `url`、`action`、`fullPage` 等），并在执行时严格匹配。

### 2) 打开 TAPD 首页（不做进一步操作）
1. （建议）锁定浏览器，避免并发干扰：
   - `run_mcp(server_name="integrated_browser", tool_name="browser_lock", args={...})`
2. 查看现有标签页并决定是否新开干净标签页：
   - `browser_tabs`：先 `action="list"`
   - 如需要：`browser_tabs`：`action="new"`（或 schema 对应的新建方式）
3. 导航到标准 TAPD 域名（仅此一步导航，不点击/不跳转到项目页面）：
   - `browser_navigate`，`args: { url: "https://www.tapd.cn/" }`
4. 分段等待加载（减少“一次等太久”的不确定性）：
   - `browser_wait_for`：先短等 2–3 秒
   - 再 `browser_snapshot` 判断页面已渲染（必要时重复：短等 → snapshot）
5. 识别当前页面状态（只做识别，不做点击）：
   - 若快照中出现“登录/验证码/CAPTCHA/安全验证”等：进入步骤 3（等待用户）
   - 若显示为 TAPD 首页/工作台：进入步骤 4（确认与留痕）

### 3) 如出现登录/验证码：等待用户手动处理（不输入账号）
1. 调用等待用户交互工具（按 schema）提示用户完成登录/验证码：
   - `browser_waiting_for_user_interaction`（reason 文案：检测到登录/验证码，需要用户手动完成）
2. 用户完成后，重新执行：
   - `browser_snapshot` → 确认当前是否已进入首页/工作台或仍停留在登录/验证码
3. 仍然只停留并确认，不做其它操作。

### 4) 采集证据与对用户确认（可选但推荐）
满足任一情况建议采集：白屏、加载异常、重定向异常、用户反馈打不开。
1. 截图：
   - `browser_take_screenshot`（优先 `fullPage: true`；文件名如 `tapd-home.png` / `tapd-login.png`）
2. 控制台日志（排障用）：
   - `browser_console_messages`（关注 error / failed resource / CSP 等）
3. 网络请求（排障用）：
   - `browser_network_requests`（关注主文档请求、30x 重定向、4xx/5xx）
4. 向用户汇报并确认（文本输出包含）：
   - 已访问的 URL（是否为 `https://www.tapd.cn/`）
   - 当前页面状态（首页/工作台 vs 登录/验证码）
   - 明确说明：未代替用户输入账号信息
5. 解锁浏览器：
   - `browser_unlock`

## Assumptions & Decisions（假设与决策）
1. 使用“标准 TAPD 域名”即：`https://www.tapd.cn/`。
2. 用户选择：**仅打开首页**；不进入具体项目页面，不进行任何点击/创建等操作。
3. 登录/验证码由用户手动完成；除非用户在后续明确允许，否则不接收或使用用户真实账号密码。
4. 若页面包含 iframe，自动化能力仅保证操作 iframe 外层内容（无法直接操作 iframe 内部）。

## Verification（验证步骤）
1. 工具可用性验证：已读取并确认 `integrated_browser` 下相关工具 schema，调用入参与 schema 一致。
2. 访问结果验证：
   - 浏览器已导航到 `https://www.tapd.cn/`，并成功渲染页面（snapshot 可见内容）。
   - 若被重定向到登录/验证码页面：已暂停等待用户手动处理，并在用户完成后再次 snapshot 确认状态。
3. 交付验证：向用户输出“当前 URL + 当前页面状态 + 是否需要用户手动登录 +（可选）截图/日志摘要”。

