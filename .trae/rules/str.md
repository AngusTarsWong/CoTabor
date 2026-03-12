
**核心理念**: 这是一个**零外部依赖**的自动化 Chrome 扩展。我们不引用 Playwright，也不引用 Midscene SDK，而是**手搓一个极简的 "Claw" 引擎**，直接调用 Chrome 原生能力。

### 🏗️ 1. 极简项目架构 (Monolith)

```text
ChromeClaw/
├── rsbuild.config.ts    # 构建工具 (极速编译)
├── manifest.json        # 核心配置 (权限: debugger, sidePanel)
└── src/
    ├── background/      # [大脑] 任务调度 (Service Worker)
    │   ├── agent.ts     # LangGraph 状态机 (思考逻辑)
    │   └── store.ts     # 状态管理
    ├── sidepanel/       # [界面] 用户交互 (React UI)
    │   ├── Chat.tsx     # 聊天窗口
    │   └── Player.tsx   # 回放时间轴
    ├── lib/             # [核心库] ★ Claw 引擎在这里
    │   ├── claw/        
    │   │   ├── index.ts # 统一入口
    │   │   ├── cdp.ts   # 封装 chrome.debugger API
    │   │   ├── dom.ts   # 视觉感知 (获取页面元素)
    │   │   └── act.ts   # 动作执行 (模拟鼠标/键盘)
    │   └── db.ts        # 记忆存储 (Dexie.js)
    └── types/           # 类型定义
```

### 🧠 2. 核心模块与流程

#### A. 交互层 (View - Sidepanel)
*   **Chat**: 用户输入自然语言指令（如“帮我把这个商品加入购物车”）。
*   **Playback**:
    *   **左侧**: 垂直步骤条 (Step 1: 规划, Step 2: 点击...)。
    *   **右侧**: 当时页面的**截图快照** + AI 的**思考日志**。
    *   **数据源**: 直接从 IndexedDB 读取，不需要复杂的 HTML 报告生成逻辑。

#### B. 逻辑层 (Controller - Background)
*   **LangGraph Agent**:
    1.  **感知**: 调用 `Claw.scan()` 获取当前页面截图和元素列表。
    2.  **思考**: 把截图发给 LLM，问“下一步点哪里？”
    3.  **行动**: 收到 LLM 回复（如 `id: 5`），调用 `Claw.click(5)`。
    4.  **记忆**: 把这一步的截图、思考、动作存入 IndexedDB。

#### C. 执行层 (Engine - Claw)
这是我们**自研的核心**，替代 Midscene/Playwright：

*   **Claw.scan()**:
    *   使用 `chrome.tabs.captureVisibleTab` 获取截图。
    *   注入一段简单的 JS (Content Script) 或使用 `DOM.getDocument` 获取页面上所有**可交互元素**的坐标。
    *   返回：`{ screenshot: "base64...", elements: [{id: 1, text: "登录", x: 100, y: 200}, ...] }`

*   **Claw.click(elementId)**:
    *   根据 ID 找到坐标 (x, y)。
    *   调用 `chrome.debugger.sendCommand("Input.dispatchMouseEvent", ...)` 模拟真实的鼠标按下和抬起。
    *   **优势**: 浏览器认为是真实用户操作，比 JS `element.click()` 更稳健，能触发 `:hover` 等效果。

### 🛠️ 3. 技术栈清单

| 模块 | 技术选型 | 理由 |
| :--- | :--- | :--- |
| **构建** | **Rsbuild** | 配置极其简单，原生支持 Chrome 插件。 |
| **UI** | **React 18** + **Ant Design** | 现成组件丰富，新手上手快。 |
| **样式** | **TailwindCSS** | 写样式像写 HTML 一样快。 |
| **AI** | **LangGraph** | 业界标准的 Agent 编排框架。 |
| **引擎** | **Claw (自研)** | 基于 `chrome.debugger`，零依赖，极简。 |
| **存储** | **Dexie.js** | 浏览器数据库封装，存图片无压力。 |

### 🔄 4. 开发路线

如果您确认，我将按此顺序执行：

1.  **地基**: 初始化项目，配置 `manifest.json` (声明 `debugger` 权限)。
2.  **引擎 (Claw)**: 实现最核心的 `cdp.ts` (连接调试器) 和 `act.ts` (点击)。
3.  **大脑**: 引入 LangGraph，写一个最简单的 Agent。
4.  **界面**: 实现 Sidepanel 的聊天和回放 UI。

## 实现方式
一步步小范围实现，不要一次性实现太多，稳扎稳打
---

