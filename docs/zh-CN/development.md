# CoTabor 开发指南

[English](../en/development.md) | 简体中文

这份文档是当前仓库开发与贡献说明的统一入口。

## 环境要求

- Node.js `>= 20`
- 用于加载扩展的 Chrome 或 Chromium
- 只有在运行 live integration 测试时才需要真实凭证

## 本地启动

```bash
npm install
npm run build
```

如果要持续迭代扩展：

```bash
npm run watch
```

然后在 `chrome://extensions/` 中从 `dist/` 目录加载已解压扩展。

## 核心命令

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

当前脚本入口以 `package.json` 为准。

## 测试模型

当前测试体系按可信度和成本分层：

- `npm run test` 或 `npm run test:unit`：单元测试
- `npm run test:integration`：基于 mock 的集成测试
- `npm run test:live:all`：连接真实服务的 live integration 测试

当前测试目录结构：

```text
scripts/tests/
├── unit/
├── integration/
├── assertions/
├── fixtures/
├── mocks/
├── runners/
└── setup.ts
```

## 开发约定

- Prompt 逻辑尽量集中放在 `src/prompts/`，不要散落在业务代码里。
- 新增内置技能或用户可见技能时，通过 `src/skills/registry.ts` 收口注册。
- 文档更新优先改索引页和统一指南，不要在随机目录旁继续长出新的 README。
- 当文档和代码冲突时，以 `package.json`、`src/core/graph/graph.ts`、`src/options/App.tsx` 为准。

## 提交前检查

- `npm run typecheck` 通过
- 相关改动需要时，`npm run lint` 通过
- 已运行与改动范围匹配的测试
- 未提交任何 secret 或环境相关值
