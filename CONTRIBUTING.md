# Contributing to CoTabor

Thank you for your interest in CoTabor! This guide covers everything you need to get started.

## Requirements

- Node.js >= 20.0.0
- A Chromium-based browser (Chrome / Edge)
- An LLM API key (OpenAI-compatible endpoint)

## Local Setup

```bash
git clone https://github.com/AngusTarsWong/CoTabor.git
cd CoTabor
npm install
cp .env.example .env   # fill in your API keys
npm run dev            # starts the rsbuild dev server
```

Load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

## Project Structure

```
src/
├── core/
│   ├── graph/nodes/      # Agent state machine nodes (planner, executor, watchdog, …)
│   ├── execution/        # Executor sub-modules (HybridUIExecutor, PageStabilizer, …)
│   ├── orchestrator/     # DAG multi-agent scheduling
│   └── types/            # Shared core types (dag, scheduler)
├── prompts/              # All LLM prompts — centralised here
│   ├── agent/            # planner, executor-grounding, watchdog, replanner, memory
│   ├── orchestrator/     # dag-planner, dag-result-resolver
│   ├── skills/           # feishu-operator, notion-operator
│   └── memory/           # distiller-merge, distiller-l3-track, experience-summarizer
├── memory/               # Three-layer memory system (L1/L2/L3)
├── skills/               # Built-in and user-defined skills
├── drivers/              # Page / CDP drivers
└── shared/               # Utilities, constants, types
```

## How to Modify Agent Behaviour

All LLM prompts live under `src/prompts/`. You can change how any agent thinks without touching business logic:

```
src/prompts/agent/planner.ts          # Strategic planner
src/prompts/agent/executor-grounding.ts # UI grounding (low-level actions)
src/prompts/agent/watchdog.ts         # Action auditor
src/prompts/agent/replanner.ts        # Failure recovery
src/prompts/agent/memory-compress.ts  # History compression
```

Each file exports a `PromptTemplate` with `system` and `user` fields. Edit those strings, save, and the change takes effect immediately in dev mode.

## How to Add a New Skill

1. Create a directory under `src/skills/library/<your-skill>/`
2. Export a `Skill` object with `name`, `description`, `params`, and `execute`
3. Register it in `src/skills/registry.ts`

See `src/skills/library/echo/index.ts` for a minimal example.

## Running Tests

```bash
npm run test:scheduler    # DAG scheduler unit tests
npm run test:memory       # Memory system tests
npm run test:graph        # Agent graph integration test (requires API key)
npm run test:e2e          # End-to-end browser automation test
```

Unit tests in `scripts/tests/unit/` run without an API key and are safe to run in CI.

## Branch & Commit Convention

- Branch: `feat/<topic>`, `fix/<topic>`, `refactor/<topic>`
- Commits: conventional commits — `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

## Pull Request Checklist

- [ ] `npm run typecheck` passes (no new TS errors)
- [ ] Prompt changes are in `src/prompts/`, not inlined in business code
- [ ] New skills include a `getManual()` implementation
- [ ] No secrets or API keys committed

## Questions?

Open an issue or start a Discussion on GitHub.
