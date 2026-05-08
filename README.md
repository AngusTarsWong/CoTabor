# CoTabor

> AI browser co-worker for Chrome Side Panel, with local-first memory, Swarm orchestration, and MCP extensibility.

English | [简体中文](./README.zh-CN.md)

CoTabor is a Chrome extension that runs an agent workspace inside the browser. It combines a LangGraph-based execution loop, local-first memory, browser automation drivers, Swarm orchestration, and user-configurable MCP tools so the agent can plan, act, recover, and learn within a single runtime. The current implementation supports focused single-page execution, intent-routed launch decisions, and multi-agent Swarm runs that can expand from a single task into a DAG during execution.

## What It Does

- Runs `single`, `auto`, and `swarm` task flows from the Chrome Side Panel and Swarm cockpit.
- Can classify a goal before launch and decide whether to stay single-agent or request Swarm collaboration.
- Can dynamically switch from a single-agent run to a Swarm run when the planner emits `spawn_subagent`.
- Runs `spawn_subagent` browser subtasks in isolated sandbox tabs so parallel agents do not contend for the same page.
- Uses local-first L1 / L2 / L3 memory to retain UI rules, tool usage knowledge, task-level strategies, and Swarm-level coordination lessons.
- Executes browser actions through Chrome Debugger / CDP, DOM extraction, and visual recovery paths.
- Loads bundled skills and remote MCP tools into one execution surface.
- Supports human confirmation for risky or blocked steps, including intervention during Swarm runs.
- Syncs memory to user-owned backends, with Notion as the primary documented path.

## Core Capabilities

| Capability | Current implementation |
|------|------|
| Agent loop | `memory -> planner -> human(optional) -> executor -> watchdog -> cortex/replanner`, with planner-triggered `spawn_subagent` delegation |
| Launch modes | `single`, `auto`, and `swarm (DAG)`; a run can start single-agent and expand into Swarm when needed |
| Browser operation | CDP navigation/input, DOM-based interaction, page extraction, visual recovery, and isolated sandbox tabs for parallel sub-agents |
| Memory | L1 page hints, L2 tool rules, L3 workflow strategy retrieval/distillation, plus Swarm-level strategic memory commit |
| Extensibility | Bundled skills plus remote MCP user skills |
| Human-in-the-loop | Interrupt, confirm, resume, replay, and Swarm intervention handling |
| Storage and sync | Local IndexedDB with async sync to user-owned backends |

## Quick Start

### Requirements

- Node.js `>= 20`
- Chrome or Chromium with developer mode enabled

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

This build regenerates `public/page-agent.bundle.js` first, then runs the main Rsbuild build.

### Load the Extension

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the repository `dist/` directory

### Minimal Setup

Current primary setup path in the Options page:

1. `LLM`: configure API key, base URL, and model
2. `Notion`: complete OAuth or provide token and parent page URL
3. `MCP`: add remote MCP servers when needed

The current top-level Options UI exposes `Notion`, `LLM`, and `MCP`.

## How It Works

### Runtime Layers

| Layer | Responsibility |
|------|------|
| UI | Side Panel workspace, replay, human approval, and Options configuration |
| Agent runtime | LangGraph node loop, planning, execution, auditing, recovery, and orchestration |
| Execution substrate | CDP tools, DOM/page drivers, perception adapters, and vision integration |
| Skills and integrations | Bundled browser/document/memory skills and remote MCP user skills |
| Memory and persistence | IndexedDB storage, retrieval, distillation, task traces, and async sync |

### Execution Loop

```text
User goal
  -> memory
  -> planner
  -> human (optional)
  -> executor
  -> watchdog
  -> cortex / replanner when needed
  -> finish or stop
```

When the planner emits `spawn_subagent`, the root run allocates isolated sandbox tabs for browser subtasks through the runtime tab driver. If an environment cannot provide that driver, ready subtasks are serialized on the shared tab to avoid concurrent page contention.

### Launch and Swarm Modes

- `single`: stay focused on the current page and complete the task with one agent.
- `auto`: classify the goal first, then choose whether to continue as a single-agent run or request Swarm collaboration.
- `swarm`: launch a multi-agent DAG run directly, typically for cross-page or research-style tasks.
- Swarm runs open a dedicated `swarm.html` cockpit so users can inspect agents, task flow, runtime state, and intervention points in a full-page view.
- Even in `single`, the planner can escalate into Swarm by emitting `spawn_subagent`; browser subtasks then run on separate sandbox tabs and report their tab assignments to the Swarm runtime view.

## Repository Map

| Path | Responsibility |
|------|------|
| `src/sidepanel` | Chat workspace, workflow UI, replay, and human-in-the-loop surfaces |
| `src/options` | User configuration for Notion, LLM, and MCP |
| `src/core/graph` | Single-run LangGraph state machine and nodes |
| `src/core/orchestrator` | Intent routing, DAG/Swarm orchestration, runtime scheduling, replay, and result resolution |
| `src/core/planning` | Intent classification, launch parsing, DAG planning, and planner response normalization |
| `src/drivers` | CDP, DOM, page, perception, and vision execution primitives |
| `src/memory` | Retrieval, persistence, task commit, distillation, and sync |
| `src/skills` | Bundled skills, MCP-loaded user skills, and registry |
| `src/swarm` | Full-page Swarm cockpit UI, runtime cards, intervention banner, and ThoughtChain views |
| `src/prompts` | Agent, orchestrator, memory, and skill prompts |
| `src/shared` | Shared types, storage, LLM config, and common utilities |

## Development

### Common Commands

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
npm run test:alibaba-news-swarm
npm run i18n:check
npm run task:run
npm run tool:debug
npm run tool:ext-debug
npm run tool:init-notion
```

### Notes

- `npm run dev` starts the Rsbuild dev server.
- `npm run watch` runs Rsbuild in watch mode for extension development.
- `npm run test` runs the current unit test entrypoint.
- `npm run test:unit` explicitly runs the unit test entrypoint.
- `npm run test:integration` runs mock integration tests.
- `npm run test:live:all` runs live integration tests and usually requires real credentials and external services.
- `npm run test:alibaba-news-swarm` runs the live multi-source Alibaba news swarm test and verifies isolated sub-agent tab allocation.
- `npm run task:run`, `npm run tool:debug`, and `npm run tool:ext-debug` are maintainer-oriented local debugging entrypoints.
- `package.json` is the source of truth for the current script surface.

## Docs

- Documentation index: [docs/README.md](./docs/README.md)
- English docs: [docs/en/README.md](./docs/en/README.md)
- Chinese docs: [docs/zh-CN/README.md](./docs/zh-CN/README.md)
- Developer guide:
  - English: [docs/en/development.md](./docs/en/development.md)
  - 中文: [docs/zh-CN/development.md](./docs/zh-CN/development.md)
- Agent state machine and background experience job:
  - English: [docs/en/agent-state-machine-and-experience-job.md](./docs/en/agent-state-machine-and-experience-job.md)
  - 中文: [docs/zh-CN/agent-state-machine-and-experience-job.md](./docs/zh-CN/agent-state-machine-and-experience-job.md)
- Third-party notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

## Built with and Inspired by Open Source

CoTabor directly uses and learns from several open-source projects. They helped shape the UI foundation, browser automation substrate, and agent runtime ergonomics of this project.

### Direct Dependencies We Build On

- [Ant Design X](https://ant-design-x.antgroup.com/): used for Side Panel AI conversation flows, message layout, and interaction scaffolding
- [Ant Design](https://ant.design/): used for general UI components, layout, forms, and settings pages
- [Midscene](https://github.com/web-infra-dev/midscene): referenced for visual browser interaction patterns and included via `@midscene/web`
- [PageAgent](https://github.com/alibaba/page-agent): used through `@page-agent/page-controller` and the generated `public/page-agent.bundle.js`

### Architecture and Design References

- [web-access](https://github.com/eze-is/web-access): referenced for browser skill design, CDP workflow patterns, and site experience accumulation

For licenses and formal attribution boundaries, see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Developed With

CoTabor is also developed, reviewed, and documented with the help of several AI-assisted programming tools. These are part of the team workflow rather than runtime dependencies of the product itself.

- Codex
- Antigravity
- Trae
- Claude Code
- Gemini

## License

MIT License © 2026 CoTabor.com Team
