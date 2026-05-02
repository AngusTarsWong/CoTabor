# 🤝 CoTabor — AI Browser Co-worker

> **一个运行在 Chrome Side Panel 中的 AI 协作代理，支持记忆、任务编排与 MCP 工具扩展。**
> *Chrome Extension · LangGraph · Memory System · MCP Client*

**CoTabor** 是一个浏览器内 AI Agent。当前实现聚焦于三个方向：

- 在侧边栏中用自然语言启动单任务或 DAG 任务
- 在本地沉淀可复用的 L1 / L2 / L3 记忆，并可同步到用户自己的 Notion
- 通过内置技能和远程 MCP Server，把页面操作、文档写入和外部工具编排到同一条执行链路中

**📖 首次使用可参考：[CoTabor 设置与操作手册](./web_access/MANUAL_ZH.md)**

---

## ✨ 当前核心能力

| 能力 | 当前实现 |
|------|------|
| 🧠 Agent 执行链路 | 基于 LangGraph 的 `memory -> planner -> executor -> watchdog -> cortex -> experience` 状态流 |
| 🗂️ 两种启动模式 | Side Panel 支持 `单任务` 与 `DAG 执行` 两种模式 |
| 👁️ 页面感知与操作 | 通过 Chrome Debugger / CDP 执行 DOM 操作，失败时可进入视觉补救链路 |
| 💾 三层记忆 | L1 页面操作经验、L2 工具调用经验、L3 任务策略经验 |
| ☁️ 记忆同步 | 当前主维护路径为 Notion；飞书后端代码仍保留，但不再是 README 推荐的首选配置流 |
| 🔌 MCP 扩展 | 支持在 Options 页配置远程 MCP Server，动态装载为用户技能 |
| 🔁 DAG 回放 | 支持按任务运行记录进行 DAG 节点回放与失败分支重放 |
| 👤 人机协同 | 任务执行过程中可暂停并请求用户确认 |

---

## 🏗️ 当前架构

```text
┌──────────────────────────────────────────────────────────────┐
│ Chrome Extension (Manifest V3)                              │
│                                                              │
│  Side Panel UI (Ant Design X + Ant Design)                  │
│  ├─ Welcome / Health Check / Chat Workspace                 │
│  ├─ Single Run / DAG Run                                    │
│  ├─ Workflow / Replay / Experience Drawer                   │
│  └─ Human-in-the-loop                                       │
│                                                              │
│  LangGraph Runtime                                           │
│  ├─ memoryNode      读取 L1/L2/L3 上下文                    │
│  ├─ plannerNode     规划下一步                              │
│  ├─ executorNode    执行内置技能 / MCP 工具 / 页面动作      │
│  ├─ watchdogNode    校验执行结果                            │
│  ├─ cortexNode      失败补救与视觉分析                      │
│  ├─ replannerNode   错误恢复后重规划                        │
│  └─ experienceNode  归档经验与同步任务                      │
│                                                              │
│  Local Runtime                                               │
│  ├─ IndexedDB MemoryStore / SyncQueue / RawTrace            │
│  ├─ Orama + BM25 retrieval                                  │
│  ├─ SkillRegistry (Bundled + MCP user skills)               │
│  └─ AgentOrchestrator / Sandbox tabs / DAG runtime          │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
                    Notion Database / Legacy Feishu Backend
```

---

## 🧠 记忆系统

### L1 — 页面操作经验

- 面向具体站点或页面交互细节，按 `domain` 检索
- 典型内容是点击偏移、页面结构规律、稳定操作路径
- 在 `memoryNode` 与执行节点中作为低成本经验提示参与推理

### L2 — 工具调用经验

- 面向技能调用约束，按 `skillName` 检索
- 典型内容是 API 参数坑位、调用前置条件、输出结构注意事项
- 会拼接到技能说明中，直接约束后续调用

### L3 — 任务策略经验

- 面向任务级 SOP、偏好和反模式，支持语义检索
- 当前本地检索结合 IndexedDB、BM25、Orama 向量索引与图扩展
- 任务完成后由 `experienceNode` 与后续经验任务管线进行提炼和提交

### 经验与同步

- 本地会保留任务运行记录、原始轨迹、记忆归因与边关系
- 同步通过 `SyncQueue` 异步推送，避免云端状态覆盖本地待提交改动
- 当前 Node 脚本与扩展运行时共用同一套 memory/runtime 抽象

---

## 🔌 MCP 与内置技能

CoTabor 既包含内置技能，也可以作为 **MCP 客户端** 动态加载远程工具。

### 内置技能

| Skill | 说明 |
|------|------|
| `notion_operator` | Notion 页面 / Database 操作与初始化 |
| `feishu_operator` | 飞书文档 / 表格操作，供兼容链路与脚本使用 |
| `browser_navigate` | 页面跳转 |
| `browser_new_tab` | 新建标签页 |
| `browser_switch_tab` | 切换标签页 |
| `browser_close_tab` | 关闭标签页 |
| `browser_click_index` | 按索引点击元素 |
| `browser_type_index` | 按索引输入文本 |
| `browser_scroll` | 页面滚动 |
| `echo` | 调试回显 |

### 外部 MCP Server

在 Options 页的 `MCP` 标签中可配置：

- `名称`：服务器标识
- `URL`：MCP 端点
- `Headers`：鉴权头 JSON
- `SSE 模式`：兼容旧版 SSE Transport

当前支持：

- `Streamable HTTP` 作为默认传输方式
- `SSE` 作为兼容模式
- 修改配置后重新加载技能，无需重启扩展

---

## ☁️ 记忆后端现状

### Notion

这是当前 README 推荐的主配置路径，也是当前 Options 页完整覆盖的后端：

1. 在 `Options -> Notion` 中完成 OAuth，或手动填写 Integration Token
2. 选择或粘贴父页面 URL
3. 点击初始化，自动创建 L1 / L2 / L3 数据库并激活 `storageBackend=notion`

### Feishu

- 仓库里仍保留 Feishu 的 operator、auth、backend-factory 与初始化实现
- 集成状态也仍然识别 Feishu 授权与后端配置
- 但当前默认 Options UI 没有挂载独立的 Feishu 设置标签，因此它不是当前首推的开箱路径

如果你要继续维护 Feishu 路线，建议把它视为“保留中的兼容后端”，而不是 README 默认使用流。

---

## ⚙️ 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建扩展

```bash
npm run build
```

开发时可用：

```bash
npm run watch
```

### 3. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 指向项目的 `dist/` 目录

### 4. 在 Options 页完成最小配置

当前最小可用配置路径：

1. `LLM`：填写 API Key / Base URL / Model，保存到本机 `chrome.storage.local`
2. `Notion`：完成 OAuth 或手动 Token 配置，选择父页面并初始化
3. `MCP`：按需接入外部工具

### 5. 在 Side Panel 启动任务

- `单任务`：直接输入自然语言目标
- `DAG 执行`：输入整体目标，由系统自动规划 DAG，并支持后续节点回放

---

## 🔐 环境变量说明

### 扩展运行时

当前扩展运行时的主路径是：

- LLM 配置通过 `Options -> LLM` 写入 `chrome.storage.local`
- Notion OAuth Client ID / Secret 与访问令牌优先存本地
- 敏感值不再通过前端构建产物统一注入

### Node 脚本 / 本地调试

如果需要运行 `scripts/` 下的测试或初始化脚本，可在根目录创建 `.env`：

```env
# 基础 LLM
LLM_API_KEY=sk-xxxx
VITE_LLM_BASE_URL=https://api.openai.com/v1
VITE_LLM_MODEL=gpt-4o

# 可选：分节点模型
VITE_LLM_PLANNER_API_KEY=
VITE_LLM_PLANNER_MODEL=
VITE_LLM_CORTEX_API_KEY=
VITE_LLM_CORTEX_MODEL=
VITE_LLM_WATCHDOG_API_KEY=
VITE_LLM_WATCHDOG_MODEL=

# Notion
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_API_KEY=
NOTION_PARENT_PAGE_URL=

# 可选：保留中的 Feishu 兼容链路
LARK_APP_ID=
LARK_APP_SECRET=
LARK_ACCESS_TOKEN=
LARK_REFRESH_TOKEN=
```

说明：

- 浏览器扩展优先读取本地存储中的运行配置
- `.env` 主要服务于 Node.js 脚本、离线调试和初始化工具
- 真实凭证不要提交到仓库

---

## 🧪 常用命令

```bash
npm run typecheck
npm run build
npm run watch
npm run test:memory
npm run test:graph
npm run test:sandbox-dag
npm run test:dag-replay
npm run test:notion
npm run test:wikipedia
```

---

## 🗂️ 项目结构

```text
src/
├── background/              # Chrome Service Worker
├── sidepanel/               # Side Panel UI、运行日志、回放与经验展示
├── options/                 # 当前设置页：Notion / LLM / MCP
├── core/
│   ├── graph/               # LangGraph 状态机与各节点
│   ├── orchestrator/        # 单任务 / DAG / 并行沙盒 / 回放
│   └── tabs/                # 标签页与资源隔离管理
├── memory/
│   ├── store/               # IndexedDB 持久化
│   ├── retrieval/           # BM25 / 向量 / 图扩展检索
│   ├── sync/                # 云端同步后端工厂
│   ├── task-commit/         # 任务运行记录、raw trace、经验同步
│   └── experience-job/      # 异步经验总结与提交
├── runner/                  # Node/extension 共享启动与适配层
├── skills/
│   ├── bundled/             # Notion / Feishu / Browser 内置技能
│   ├── user/                # MCP 用户技能装载
│   ├── library/             # 轻量工具技能
│   └── registry.ts          # 双源技能注册表
└── shared/
    ├── constants/           # ENV 与运行配置入口
    ├── storage/             # integration-status / ui-preferences
    ├── types/               # memory / operator / runtime 类型
    └── utils/               # auth / document / memory helpers
```

---

## 🔄 执行流程

```text
用户输入目标
  ↓
memoryNode
  ↓
plannerNode / replannerNode
  ↓
executorNode
  ↓
watchdogNode
  ├─ 成功 → 回到 plannerNode 继续
  └─ 失败 → cortexNode 做补救与分析
                ↓
          experienceNode / memory commit
                ↓
          本地归档 + 异步同步
```

在 DAG 模式下，这条链路会被 `AgentOrchestrator` 调度到共享页签或隔离页签资源中执行，并生成可回放的任务运行记录。

---

## 🔒 安全与隐私

- 记忆主数据保存在本地 IndexedDB，以及用户自己的 Notion 或兼容后端中
- LLM / Notion 等敏感配置优先写入本地 `chrome.storage.local`
- 当前构建配置已避免把真实 secret 默认注入到前端产物
- 本地存在待同步改动时，不会直接用云端结果覆盖本地状态

---

## 📦 技术栈

| 层次 | 技术 |
|------|------|
| 扩展框架 | Chrome Extension Manifest V3 |
| 前端 | React 18 + TypeScript + Ant Design + Ant Design X |
| Agent Runtime | LangGraph + LangChain |
| 模型接入 | OpenAI-compatible API |
| 本地存储 | IndexedDB (`idb`) |
| 检索 | Orama + `wink-bm25-text-search` |
| MCP 客户端 | `@modelcontextprotocol/sdk` |
| 浏览器执行 | Chrome Debugger / CDP + page-controller |
| 文档集成 | Notion REST + `mcp.notion.com/mcp` |
| 构建 | Rsbuild |

---

## 🤝 Contributing & License

MIT License © 2026 **CoTabor.ai** Team
