# CoTabor 文档

[English](../en/README.md) | 简体中文

这里是 CoTabor 的中文文档集合。

## 结构

这套文档现在只保留少数几个长期维护的领域：

- `README.md` 与 `README.zh-CN.md`：项目首页与快速开始
- `development.md`：开发、贡献、脚本与测试约定
- `agent-state-machine-and-experience-job.md`：深度架构说明
- `manual/`：集成类配置文档
- `THIRD_PARTY_NOTICES.md`：法律归因说明

## 当前文档

### 开发

- [开发指南](./development.md)

### 架构

- [Agent 状态机与后台经验任务设计](./agent-state-machine-and-experience-job.md)

### 集成

- [Notion 设置](./manual/notion.md)
- [飞书后端设置（兼容/历史路径）](./manual/feishu.md)

### 法务

- [第三方说明](../../THIRD_PARTY_NOTICES.md)

## 代码优先的真实入口

当文档与代码不一致时，以下文件应视为当前实现的真实参考：

| 领域 | Source of truth |
|------|------|
| Agent graph 拓扑 | `src/core/graph/graph.ts` |
| Options 页签 | `src/options/App.tsx` |
| 内置技能与 MCP 技能注册 | `src/skills/registry.ts` |
| 脚本入口 | `package.json` |
| 测试目录结构 | `scripts/tests/` |
