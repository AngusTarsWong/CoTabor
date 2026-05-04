# CoTabor Docs

English | [简体中文](../zh-CN/README.md)

This directory contains the English documentation set.

## Structure

The documentation set is intentionally organized into a small number of maintenance domains:

- `README.md` and `README.zh-CN.md`: project homepage and quick start only
- `development.md`: contributor workflow, setup, scripts, and testing expectations
- `agent-state-machine-and-experience-job.md`: deep architecture notes
- `manual/`: integration-specific setup documents
- `THIRD_PARTY_NOTICES.md`: legal attribution only

## Current Documents

### Development

- [Development guide](./development.md)

### Architecture

- [Agent state machine and background experience job](./agent-state-machine-and-experience-job.md)

### Integrations

- [Notion setup](./manual/notion.md)
- [Feishu backend setup (legacy compatibility path)](./manual/feishu.md)

### Legal

- [Third-party notices](../../THIRD_PARTY_NOTICES.md)

## Source of Truth

When documentation and code differ, prefer these files as the current implementation reference:

| Area | Source of truth |
|------|------|
| Agent graph topology | `src/core/graph/graph.ts` |
| Options page tabs | `src/options/App.tsx` |
| Bundled and MCP skill registration | `src/skills/registry.ts` |
| Script surface | `package.json` |
| Test layout | `scripts/tests/` |
