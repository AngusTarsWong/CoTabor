# 🤝 CoTabor — AI Browser Co-worker

> **一个纯浏览器插件形态的 AI Agent，能记忆、能学习、能接入任意 MCP 工具。**
> *Chrome Extension · LangGraph · Three-Layer Memory · MCP Ecosystem*

**CoTabor** (Co-laborer + Tab) 是一个运行在 Chrome 浏览器中的 AI 自动化 Agent。它通过 LangGraph 状态机驱动，具备视觉感知、DOM 操作、三层云边协同记忆与开放的 MCP 工具生态，让用户只需在侧边栏输入自然语言指令即可自动完成跨网页的复杂任务。

**📖 首次使用？请查看：[CoTabor 飞书/Notion 设置与操作手册](./web_access/MANUAL_ZH.md)**

---

## ✨ 核心能力

| 能力 | 说明 |
|------|------|
| 🧠 自主任务规划 | LangGraph 驱动的 Planner → Executor → Watchdog → Cortex 完整推理链 |
| 👁️ 双通道感知 | 轻量 DOM 快通道 + 多模态视觉慢通道自动切换 |
| 💾 三层持久化记忆 | L1 肌肉记忆 / L2 技能图谱 / L3 战术偏好，本地 IndexedDB + 向量检索 |
| ☁️ 云端记忆同步 | 飞书多维表格或 Notion Database 双后端，可随时切换 |
| 🔌 MCP 工具接入 | 在 Options 页添加任意远程 MCP Server，工具自动注入 Agent |
| 🗂️ 并行沙盒模式 | 多 Tab 并发执行，通过 Chrome TabGroup 隔离 |
| 👤 人机协同 | 任务中途可请求人类介入确认 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│  Cloud (Memory Backend — 用户选择)                              │
│  飞书 Bitable API  ←→  SyncWorker  ←→  Notion Database API    │
└─────────────────────┬───────────────────────────────────────────┘
                       │ 异步双向同步（重试队列 + 冲突检测）
┌─────────────────────▼───────────────────────────────────────────┐
│  Chrome Extension (Edge-First)                                  │
│                                                                 │
│  IndexedDB                          SkillRegistry              │
│  ├── L1 MuscleMemory (domain rules) ├── Bundled Skills         │
│  ├── L2 SkillMemory  (API rules)    │   ├── feishu_operator    │
│  └── L3 TacticalMemory + Orama      │   ├── notion_operator    │
│        Vector Index (embeddings)    │   └── browser_*  (7个)  │
│                                     └── User/MCP Skills        │
│  LangGraph Agent                        (远程 MCP Server 工具) │
│  ├── memoryNode  → L1+L3 RAG 读取                              │
│  ├── plannerNode → 生成执行计划                                 │
│  ├── executorNode → CDP DOM 操作                                │
│  ├── watchdogNode → 结果验证                                    │
│  ├── cortexNode  → 视觉自愈 (截图+多模态)                      │
│  ├── experienceNode → L3 记忆写入                               │
│  └── humanNode   → Human-in-the-Loop                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🧠 三层记忆系统

### L1 — 肌肉记忆 (MuscleMemory)
**作用**：DOM 交互精确规则（"这个网站的提交按钮要用 CDP 偏移 (12, 8) 点击"）

- 存储：`IndexedDB` → 按 `domain` 检索
- 执行时：`memoryNode` 查询当前域名规则，注入 Planner 上下文
- 来源：Watchdog/Cortex 抢救成功后自动蒸馏写入

### L2 — 技能图谱 (SkillMemory)
**作用**：API 参数纠错规则（"调用 feishu_create_doc 时 folder_token 不能含斜杠"）

- 存储：`IndexedDB` → 按 `skillName` 检索
- 执行时：动态追加到 Skill 描述末尾，引导 LLM 避坑

### L3 — 战术记忆 (TacticalMemory)
**作用**：任务级 SOP 与用户偏好（自然语言 + 向量嵌入）

- 存储：`IndexedDB` + `Orama` WebAssembly 向量索引
- 执行时：`memoryNode` 用当前请求做语义检索，取 Top-3 注入
- 来源：`experienceNode` 任务结束后，LLM 提炼写入并入队同步

### 云端同步 (SyncWorker)
- **推送**：本地变更入 `SyncQueue` → 批量推送云端，失败最多重试 3 次后丢弃
- **拉取**：`pullCloudToEdge` 按 `updatedAt` 增量拉取，本地有待推送记录则跳过（防止 Last-Write-Wins 覆盖）

---

## 🔌 MCP 工具生态

CoTabor 作为 **MCP 客户端**，可接入任意远程 HTTP MCP Server。

### 配置方式（Options 页 → MCP 服务器）

| 字段 | 说明 |
|------|------|
| 名称 | 服务器标识，也是工具列表的分组标签 |
| URL | MCP Server 端点，如 `https://your-worker.workers.dev/mcp` |
| Headers | 鉴权头，如 `{"Authorization": "Bearer token"}` |
| SSE 模式 | 勾选后使用旧版 SSE Transport（兼容 2025-03 之前规范） |

支持：**Streamable HTTP Transport**（默认）和 **SSE Transport**（自动 fallback）

### 推荐接入的公开 MCP Server

```
GitHub Copilot MCP:  https://api.githubcopilot.com/mcp/
Notion MCP:          https://mcp.notion.com/mcp  (需 OAuth Token)
飞书 MCP:            通过 feishu_operator skill 内置调用
```

### 热重载
Options 页点击 **"重新加载技能"** 即可无需重启插件更新 MCP 工具列表。

---

## ☁️ 记忆后端：飞书 vs Notion

两套后端均通过统一的 `TableOperator` 接口接入 `SyncWorker`，随时可切换，互不影响。

### 飞书后端（默认）
1. Options → **飞书设置** → 在本地填写 `App ID / App Secret`，然后扫码授权
2. 填入飞书空文件夹链接 → 一键初始化（自动创建 `Cotabor_Memories` + `Cotabor_Logs` 多维表格）
3. L1/L2/L3 记忆实时同步至飞书 Bitable

### Notion 后端
1. Options → **Notion 设置** → 选择授权方式：
   - **OAuth 快速授权**：在本地填写 `Client ID / Client Secret` 后点击授权
   - **手动 Integration Token**：粘贴 `secret_...` Token
2. 填入父页面 URL → 一键初始化（自动创建 L1/L2/L3 三个 Notion Database）
3. 点击"切换为 Notion 后端"生效

---

## 🛠️ 内置技能 (Bundled Skills)

| Skill 名称 | 类型 | 说明 |
|-----------|------|------|
| `feishu_operator` | action | 飞书文档全操作（通过 `mcp.feishu.cn/mcp` 调用，支持 UAT/TAT 双身份） |
| `notion_operator` | action | Notion 文档全操作（通过 `mcp.notion.com/mcp` 调用）|
| `browser_navigate` | action | 跳转到指定 URL |
| `browser_new_tab` | action | 新建标签页 |
| `browser_switch_tab` | action | 切换到指定 Tab |
| `browser_close_tab` | action | 关闭指定 Tab |
| `browser_click_index` | action | 按索引点击页面元素 |
| `browser_type_index` | action | 按索引向元素输入文字 |
| `browser_scroll` | action | 页面滚动 |
| `echo` | query | 调试用回显工具 |

---

## ⚙️ 快速开始

### 1. 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# LLM 配置（必填，供 Node 脚本 / 本地初始化使用）
LLM_API_KEY=sk-xxxx
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_MODEL=gpt-4o

# 可选：各节点独立模型配置
VITE_LLM_PLANNER_API_KEY=
VITE_LLM_PLANNER_MODEL=

# 飞书 OAuth
# App ID 可公开注入；App Secret 不再进入前端构建产物
VITE_LARK_APP_ID=cli_xxxx
LARK_APP_ID=cli_xxxx
LARK_APP_SECRET=xxxx

# Notion OAuth
# Client ID 可公开注入；Client Secret 不再进入前端构建产物
VITE_NOTION_CLIENT_ID=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=

# Notion Node / 脚本模式
NOTION_API_KEY=

# 向量嵌入（火山引擎，用于 L3 语义检索）
VITE_VOLCENGINE_API_KEY=
```

说明：
- 浏览器扩展中的敏感 secret 与 API Key 应通过 Options 页保存在本机 `chrome.storage.local`。
- `.env` 中的真实凭证主要面向 Node.js 脚本、本地初始化与私有开发环境。

### 2. 安装依赖 & 构建

```bash
npm install
npm run build
```

### 3. 加载插件

1. 打开 Chrome → `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」→ 选择 `dist/` 目录

### 4. 初始化记忆后端

- 点击插件图标 → 右上角齿轮 → Options 页
- 选择「飞书设置」或「Notion 设置」完成授权和一键初始化
- （可选）在「MCP 服务器」页添加外部 MCP 工具

---

## 🗂️ 项目结构

```
src/
├── background/          # Service Worker（插件生命周期）
├── sidepanel/           # 侧边栏 UI（对话界面 + Debug Drawer）
├── options/             # 设置页（飞书 / Notion / MCP Server 管理）
├── core/
│   ├── graph/           # LangGraph 状态机
│   │   └── nodes/       # planner / executor / watchdog / cortex /
│   │                    # memory / experience / human / replanner
│   ├── orchestrator/    # AgentOrchestrator（单 Tab + 多 Tab 并行沙盒）
│   └── tabs/            # TabGroupManager（Chrome TabGroup 生命周期）
├── memory/
│   ├── store/           # IndexedDB（MemoryStore L1/L2/L3 + SyncQueue）
│   ├── sync/            # SyncWorker + backend-factory（飞书/Notion 自动选择）
│   ├── rag/             # Orama 向量索引 + 火山引擎 Embedding
│   └── distiller/       # MemoryDistiller（LLM 提炼经验）
├── skills/
│   ├── bundled/
│   │   ├── feishu-operator/   # 飞书文档操作 Skill + Bitable 初始化
│   │   ├── notion-operator/   # Notion 操作 Skill + Database 初始化
│   │   └── system-browser/    # 7 个浏览器操作 Skill
│   ├── user/                  # MCP 客户端（Adapter + Loader）
│   ├── library/               # Echo 等工具 Skill
│   ├── registry.ts            # 双源技能注册表（Bundled + MCP）
│   └── types.ts               # Skill 接口定义
└── shared/
    ├── constants/env.ts        # 统一环境变量入口
    ├── types/                  # memory.ts / operator.ts 核心类型
    └── utils/                  # lark-auth / notion-auth / lark-utils
```

---

## 🔄 Agent 执行流程

```
用户输入
   │
   ▼
memoryNode ──→ L1 domain rules + L3 vector search → 注入上下文
   │
   ▼
plannerNode ──→ 选择下一个 Skill / 判断任务完成
   │
   ├── human_request → humanNode（暂停等待用户确认）
   │
   ▼
executorNode ──→ 执行 Skill（DOM 操作 / 飞书 / Notion / MCP 工具...）
   │
   ▼
watchdogNode ──→ 截图验证结果
   │
   ├── 成功 → 回 plannerNode
   └── 失败 → cortexNode（多模态视觉自愈）
                  │
                  └── 成功 → 提炼经验 → experienceNode → 写入 L3 → 回 plannerNode
```

---

## 🔧 并行沙盒模式 (AgentOrchestrator)

当任务需要并发执行时，`AgentOrchestrator` 可在 Chrome TabGroup 中启动多个独立 Agent：

- 每个 Agent 运行在独立 Tab 中，互不干扰
- 使用 `Promise.allSettled` 确保单个失败不影响其他 Agent
- TabGroup 任务结束后自动销毁所有 Tab（含 placeholder tab 清理）

---

## 🔒 安全与隐私

- **无第三方记忆服务**：L1/L2/L3 数据只存在于本地 IndexedDB 与用户自己的飞书/Notion
- **Token 安全**：飞书 UAT / Notion OAuth Token 存储于 `chrome.storage.local`，不上传任何服务器
- **CDP 操作**：通过 `attachedByCaller` flag 防止误断用户已有的调试会话
- **SyncQueue 保护**：本地有待推送的变更时，拉取云端不会覆盖（防 Last-Write-Wins）

---

## 📦 技术栈

| 层次 | 技术 |
|------|------|
| 框架 | Chrome Extension (Manifest V3) + React + TypeScript |
| AI 推理 | LangGraph + LangChain + OpenAI-compatible API |
| 本地存储 | IndexedDB (idb) |
| 向量检索 | Orama (WebAssembly) |
| 嵌入模型 | 火山引擎多模态嵌入 API |
| MCP 客户端 | `@modelcontextprotocol/sdk` (Streamable HTTP + SSE) |
| 飞书集成 | Feishu OpenAPI + `mcp.feishu.cn/mcp` |
| Notion 集成 | Notion REST API v1 + `mcp.notion.com/mcp` |
| 构建工具 | Vite + WXT |

---

## 🤝 Contributing & License

MIT License © 2026 **CoTabor.ai** Team
