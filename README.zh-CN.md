# CoTabor

> 运行在 Chrome Side Panel 中的 AI 浏览器协作代理，支持本地优先记忆、Swarm 编排与 MCP 扩展。

[English](./README.md) | 简体中文

CoTabor 是一个在浏览器内运行 Agent 工作区的 Chrome 扩展。它把基于 LangGraph 的执行主循环、本地优先记忆、浏览器自动化驱动、Swarm 编排能力，以及用户可配置的 MCP 工具接到同一运行时里，让 Agent 可以在一次任务中完成规划、执行、恢复和学习。当前实现同时支持专注的单页执行、基于意图的启动决策，以及在执行过程中从单 Agent 动态扩展成 DAG/Swarm 的多 Agent 运行。

## 项目能力

- 在 Chrome Side Panel 与 Swarm 蜂群指挥台中运行 `single`、`auto`、`swarm` 三类任务流。
- 可以在启动前先做任务意图分类，再决定保持单 Agent 执行还是请求 Swarm 协作。
- 可以在单 Agent 执行过程中，通过 planner 输出 `spawn_subagent` 动态切换成 DAG/Swarm 编排。
- 使用本地优先的 L1 / L2 / L3 记忆，沉淀页面规则、工具调用经验、任务级策略，以及 Swarm 协作级经验。
- 通过 Chrome Debugger / CDP、DOM 抽取与视觉补救路径执行浏览器动作。
- 在同一执行面中同时加载内置技能与远程 MCP 工具。
- 对高风险或受阻步骤支持人工确认，包括 Swarm 运行时的人工介入。
- 支持将记忆同步到用户自有后端，当前主文档路径以 Notion 为主。

## 核心能力

| 能力 | 当前实现 |
|------|------|
| Agent 主循环 | `memory -> planner -> human(optional) -> executor -> watchdog -> cortex/replanner`，且 planner 可通过 `spawn_subagent` 交还 orchestrator |
| 启动模式 | `single`、`auto`、`swarm (DAG)`；任务可先以单 Agent 启动，再按需扩展成 Swarm |
| 浏览器操作 | CDP 导航/输入、基于 DOM 的交互、页面抽取、视觉补救 |
| 记忆 | L1 页面提示、L2 工具规则、L3 工作流策略检索/提炼，以及 Swarm 级策略记忆写入 |
| 可扩展性 | 内置技能与远程 MCP 用户技能 |
| 人机协同 | 中断、确认、恢复、回放，以及 Swarm 介入处理 |
| 存储与同步 | 本地 IndexedDB + 异步同步到用户自有后端 |

## 快速开始

### 环境要求

- Node.js `>= 20`
- 启用开发者模式的 Chrome 或 Chromium

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

构建时会先重建 `public/page-agent.bundle.js`，再执行主 Rsbuild 构建。

### 加载扩展

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 点击“加载已解压的扩展程序”
4. 选择仓库下的 `dist/` 目录

### 最小配置

当前推荐的 Options 配置路径：

1. `LLM`：配置 API Key、Base URL 和 Model
2. `Notion`：完成 OAuth，或填写 Token 与父页面 URL
3. `MCP`：按需添加远程 MCP Server

当前顶层 Options UI 暴露的是 `Notion`、`LLM` 和 `MCP`。

## 工作方式

### 运行时分层

| 层 | 职责 |
|------|------|
| UI | Side Panel 工作区、回放、人机确认与 Options 配置 |
| Agent runtime | LangGraph 节点循环、规划、执行、审计、恢复与编排 |
| Execution substrate | CDP 工具、DOM/page 驱动、感知适配与视觉集成 |
| Skills and integrations | 内置 browser/document/memory 技能与远程 MCP 用户技能 |
| Memory and persistence | IndexedDB 存储、检索、提炼、任务轨迹与异步同步 |

### 执行主循环

```text
用户目标
  -> memory
  -> planner
  -> human (optional)
  -> executor
  -> watchdog
  -> 必要时进入 cortex / replanner
  -> finish 或 stop
```

在 DAG 模式下，orchestrator 会把这条主循环调度到共享或隔离的 tab 资源上，并保留可回放的 task run。

### 启动方式与 Swarm 模式

- `single`：专注当前页面，由单个 Agent 完成任务。
- `auto`：先判断任务意图，再决定继续单 Agent 执行还是转入 Swarm 协作。
- `swarm`：直接启动多 Agent DAG 任务，适合跨页、多来源、研究型任务。
- Swarm 任务会打开独立的 `swarm.html` 蜂群指挥台，让用户在全页面视图中查看 Agent 卡片、任务流、运行态和介入点。
- 即使任务最初以 `single` 启动，planner 也可以通过 `spawn_subagent` 将任务升级为 Swarm，由 orchestrator 接管后续协同执行。

## 仓库地图

| 路径 | 职责 |
|------|------|
| `src/sidepanel` | 聊天工作区、工作流 UI、回放与人机协同界面 |
| `src/options` | Notion、LLM、MCP 等用户配置入口 |
| `src/core/graph` | 单次运行的 LangGraph 状态机与节点 |
| `src/core/orchestrator` | 意图路由、DAG/Swarm 编排、运行时调度、回放与结果归并 |
| `src/core/planning` | 意图分类、启动请求解析、DAG 规划与 planner 响应归一化 |
| `src/drivers` | CDP、DOM、page、perception、vision 执行原语 |
| `src/memory` | 检索、持久化、task commit、提炼与同步 |
| `src/skills` | 内置技能、MCP 用户技能与注册表 |
| `src/swarm` | 全页面 Swarm 蜂群指挥台 UI、运行卡片、介入横幅与 ThoughtChain 视图 |
| `src/prompts` | Agent、orchestrator、memory、skill prompts |
| `src/shared` | 共享类型、存储、LLM 配置与通用工具 |

## 开发

### 常用命令

```bash
npm run dev
npm run build
npm run watch
npm run typecheck
npm run lint
npm run test
npm run test:unit
npm run test:integration
npm run test:live:all
npm run i18n:check
npm run task:run
npm run tool:debug
npm run tool:ext-debug
npm run tool:init-notion
```

### 说明

- `npm run dev` 启动 Rsbuild dev server。
- `npm run watch` 用于扩展开发时的 Rsbuild watch 模式。
- `npm run test` 运行当前单元测试入口。
- `npm run test:unit` 显式运行单元测试入口。
- `npm run test:integration` 运行 mock integration 测试。
- `npm run test:live:all` 运行 live integration 测试，通常需要真实凭证和外部服务。
- `npm run task:run`、`npm run tool:debug`、`npm run tool:ext-debug` 更适合作为维护者本地调试入口。
- 当前脚本入口以 `package.json` 为准。

## 文档

- 文档入口：[docs/README.md](./docs/README.md)
- English docs: [docs/en/README.md](./docs/en/README.md)
- 中文文档: [docs/zh-CN/README.md](./docs/zh-CN/README.md)
- 开发指南：
  - English: [docs/en/development.md](./docs/en/development.md)
  - 中文: [docs/zh-CN/development.md](./docs/zh-CN/development.md)
- Agent 状态机与后台经验任务：
  - English: [docs/en/agent-state-machine-and-experience-job.md](./docs/en/agent-state-machine-and-experience-job.md)
  - 中文: [docs/zh-CN/agent-state-machine-and-experience-job.md](./docs/zh-CN/agent-state-machine-and-experience-job.md)
- 第三方说明：[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

## Built with and Inspired by Open Source

CoTabor 在 UI 基础设施、浏览器自动化底座和 Agent runtime 工程体验上直接使用并借鉴了多个开源项目。

### 直接使用的依赖

- [Ant Design X](https://ant-design-x.antgroup.com/)：用于 Side Panel 中的 AI 对话流、消息布局与交互骨架
- [Ant Design](https://ant.design/)：用于通用 UI 组件、布局、表单和设置页
- [Midscene](https://github.com/web-infra-dev/midscene)：通过 `@midscene/web` 引入，并参考其视觉浏览器交互模式
- [PageAgent](https://github.com/alibaba/page-agent)：通过 `@page-agent/page-controller` 和生成的 `public/page-agent.bundle.js` 使用

### 架构与设计参考

- [web-access](https://github.com/eze-is/web-access)：参考其 browser skill 设计、CDP 工作流模式与站点经验沉淀方式

关于许可证和正式归因边界，请见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 开发与协作工具

CoTabor 在开发、评审、调试和文档整理过程中，也会结合多种 AI 辅助编程工具。这些工具属于团队研发工作流的一部分，而不是产品运行时依赖。

- Codex
- Antigravity
- Trae
- Claude Code
- Gemini

## License

MIT License © 2026 CoTabor.com Team
