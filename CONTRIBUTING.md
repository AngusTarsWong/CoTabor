# Contributing to CoTabor

English | [简体中文](./docs/zh-CN/development.md)

This file is intentionally brief. The canonical contributor workflow now lives in the multilingual docs:

- English: [docs/en/development.md](./docs/en/development.md)
- 中文: [docs/zh-CN/development.md](./docs/zh-CN/development.md)

## Quick Start

```bash
npm install
npm run build
npm run typecheck
```

## Source of Truth

When documentation drifts, prefer:

- scripts: `package.json`
- tests: `scripts/tests/`
- architecture: `src/core/graph/graph.ts`
- skill surface: `src/skills/registry.ts`
