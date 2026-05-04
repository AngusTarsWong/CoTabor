# CoTabor Development Guide

English | [简体中文](../zh-CN/development.md)

This is the canonical development and contributor guide for the repository.

## Requirements

- Node.js `>= 20`
- Chrome or Chromium for extension loading
- Real credentials only when running live integration tests

## Local Setup

```bash
npm install
npm run build
```

For extension iteration:

```bash
npm run watch
```

Then load the unpacked extension from `dist/` in `chrome://extensions/`.

## Core Commands

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

`package.json` is the source of truth for the current script surface.

## Test Model

The test layout is intentionally split by confidence level:

- `npm run test` or `npm run test:unit`: unit tests
- `npm run test:integration`: mock-backed integration tests
- `npm run test:live:all`: live integration tests with real services

Current test directories:

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

## Development Rules

- Keep prompt logic under `src/prompts/` instead of scattering instructions through business code.
- Register new built-in or user-facing skills through `src/skills/registry.ts`.
- Prefer updating docs indexes and canonical guides instead of creating one-off README files near random directories.
- When docs and code conflict, trust `package.json`, `src/core/graph/graph.ts`, and `src/options/App.tsx`.

## Pull Request Checklist

- `npm run typecheck` passes
- `npm run lint` passes when relevant files changed
- tests appropriate to the change have been run
- no secrets or environment-specific values were committed
