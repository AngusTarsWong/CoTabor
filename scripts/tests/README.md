# CoTabor Testing Framework

欢迎来到 CoTabor 的自动化测试目录。这里不仅包含了保证代码底层正确性的单元测试，还包含了验证 Multi-Agent 协作能力、记忆闭环以及沙盒隔离的高级端到端测试。

为兼顾**本地开发极速验证**和**大模型真实表现评估**，我们的测试系统采用了**“双轨制 (Dual-Track)”** 与 **“高度模块化 (Modular)”** 的设计。

## 📁 目录结构 (Modular Design)

```text
scripts/tests/
├── unit/               # 纯粹的单元测试 (针对单一函数/类的逻辑测试)
├── integration/        # 核心集成与 E2E 测试 (针对 Agent 完整执行生命周期的测试)
│
├── runners/            # [共享模块] 基础运行环境封装 (如 Bootstrap 包装、测试前后清理 Teardown、资源回收)
├── mocks/              # [共享模块] 大模型返回模拟 (MockPlanner)、网络请求拦截器、API 伪造器
├── fixtures/           # [共享模块] 测试使用的静态数据 (静态 HTML、预设的记忆上下文、特定 Goal 定义)
├── assertions/         # [共享模块] Agent 专用的自定义断言工具 (如 assertDagCompleted)
│
├── setup.ts            # 全局测试初始化钩子 (Global test setup)
└── README.md           # 本文档
```

## 🚀 执行测试 (Dual-Track)

为了满足不同的测试诉求，我们在 `package.json` 中配置了不同的命令：

### 1. 极速本地验证轨 (Mock Track)
**完全不消耗 Token，不产生真实网络请求。适合每次保存代码后高频运行！**

```bash
# 运行所有底层单元测试
npm run test:unit

# 运行使用 Mock 数据的高级集成测试 (测试 DAG 调度逻辑等)
npm run test:integration
```

### 2. 真实大模型验收轨 (Live Track)
**将调用真实大模型并操作真实的页面环境。用于回归验证和观察 Agent 真实表现。**

*(⚠️ 运行前请确保 `.env` 中的 `LLM_API_KEY` 和必要凭证已配置)*

```bash
# 运行新闻总结的多 Agent 真实并发验收
npm run test:live:news

# 运行涉及 Notion 操作、记忆同步的完整 E2E 回归
npm run test:live:e2e

# 一键运行所有 Live 测试
npm run test:live:all
```

## 🧠 测试设计原则

我们在编写新测试用例时，需遵循以下原则，避免沦为单纯的“RPA 指令测试”：

1. **声明式目标 (Declarative Goal)**：避免在测试中硬编码“按顺序点击什么”，而是给出最终目标（例如“总结新闻”），让 Planner 自主决策。
2. **混沌与容错性 (Resilience)**：测试必须包含非理想情况。例如给定一个 404 网址，验证 DAG 是否能正确将其标记为失败，并让下游任务降级处理。
3. **记忆效能验证 (Memory Loop)**：不仅要测试大模型能否“写入” L2/L3 记忆，还要设计 Two-pass 测试，验证它下次能否成功“利用”记忆避坑。
4. **清理现场 (Teardown)**：任何调用外部 API 产生真实数据（如在 Notion 创建页面）的 Live 测试，必须在 `after()` 钩子中执行清理删除动作，严禁污染测试环境。

## 🛠 开发与调试技巧

- **可视化 Trace**：在 Live 测试运行完成后，可以在根目录的 `.test-traces/` 下找到本次运行的完整 JSON 追踪报告，方便你回溯大模型的 Prompt、响应内容及 DAG 执行拓扑图。
- **模块化复用**：如果你需要构造一个特定的测试环境，请善用 `runners/` 目录中已封装好的 `bootstrapTestNode()` 方法，不要重复写底层的 `try/finally` 销毁逻辑。

---
*Happy Testing & Agent Building! 🤖✨*
