# CoTabor

> 运行在 Chrome Side Panel 中的 AI 浏览器协作代理，支持记忆、任务编排与 MCP 扩展。

[English](./README.md) | 简体中文

CoTabor 是一个在浏览器内运行 Agent 工作区的 Chrome 扩展。它把基于 LangGraph 的执行主循环、本地优先记忆、浏览器自动化驱动，以及用户可配置的 MCP 工具接到同一运行时里，让 Agent 可以在一次任务中完成规划、执行、恢复和学习。

## 项目能力

- 在 Chrome Side Panel 中运行单目标任务与 DAG 任务。
- 使用本地优先的 L1 / L2 / L3 记忆，沉淀页面规则、工具调用经验与任务级策略。
- 通过 Chrome Debugger / CDP、DOM 抽取与视觉补救路径执行浏览器动作。
- 在同一执行面中同时加载内置技能与远程 MCP 工具。
- 对高风险或受阻步骤支持人工确认。
- 支持将记忆同步到用户自有后端，当前主文档路径以 Notion 为主。

## 核心能力

| 能力 | 当前实现 |
|------|------|
| Agent 主循环 | `memory -> planner -> human(optional) -> executor -> watchdog -> cortex/replanner` |
| 启动模式 | 单任务与 DAG 执行 |
| 浏览器操作 | CDP 导航/输入、基于 DOM 的交互、页面抽取、视觉补救 |
| 记忆 | L1 页面规则、L2 工具经验、L3 任务策略检索与提炼 |
| 可扩展性 | 内置技能与远程 MCP 用户技能 |
| 人机协同 | 中断、确认、恢复与回放 |
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

当前顶层 Options UI 暴露的是 `Notion`、`LLM` 和 `MCP`。仓库内仍保留 Feishu 相关代码作为兼容路径，但它不是当前主文档推荐的默认配置流。

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

## 仓库地图

| 路径 | 职责 |
|------|------|
| `src/sidepanel` | 聊天工作区、工作流 UI、回放与人机协同界面 |
| `src/options` | Notion、LLM、MCP 等用户配置入口 |
| `src/core/graph` | 单次运行的 LangGraph 状态机与节点 |
| `src/core/orchestrator` | DAG 启动规划、运行时调度、回放与结果归并 |
| `src/drivers` | CDP、DOM、page、perception、vision 执行原语 |
| `src/memory` | 检索、持久化、task commit、提炼与同步 |
| `src/skills` | 内置技能、MCP 用户技能与注册表 |
| `src/prompts` | Agent、orchestrator、memory、skill prompts |
| `src/shared` | 共享类型、存储、LLM 配置与通用工具 |

## 开发

### 常用命令

```bash
npm run build
npm run watch
npm run typecheck
npm run lint
npm run test
npm run test:integration
npm run test:live:all
npm run tool:init-notion
```

### 说明

- `npm run watch` 用于扩展开发时的 Rsbuild watch 模式。
- `npm run test` 运行当前单元测试入口。
- `npm run test:integration` 运行 mock integration 测试。
- `npm run test:live:all` 运行 live integration 测试，通常需要真实凭证和外部服务。
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

## License

MIT License © 2026 CoTabor.com Team
