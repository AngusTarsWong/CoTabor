cotabor-agent/
├── entrypoints/             # WXT 扩展入口 (保持轻量，仅做转发)
│   ├── background/          # 背景脚本：启动大脑 (Kernel)
│   ├── sidepanel/           # 侧边栏：UI 渲染与用户交互
│   └── content/             # 内容脚本：page-agent 运行环境
│
├── src/                     # 核心代码空间
│   ├── core/                # 【Brain: 认知内核】
│   │   ├── graph/           # LangGraph 状态机定义
│   │   ├── scheduler/       # 任务调度与并发管理
│   │   └── state.ts         # 全局状态 (Context) 定义
│   │
│   ├── perception/          # 【Sensors: 感知层】
│   │   ├── adapters/        # 感知适配器 (ali-page, midscene)
│   │   ├── scaler.ts        # 阶梯式感知调度器 (L1 <-> L3)
│   │   └── vision.ts        # 视觉识别专用逻辑
│   │
│   ├── drivers/             # 【Limbs: 执行层】
│   │   ├── cdp/             # 物理级驱动：Chrome Debugger Protocol
│   │   ├── dom/             # 轻量级驱动：JS DOM 操作
│   │   └── registry.ts      # 驱动注册中心 (支持物理驱动与脚本驱动切换)
│   │
│   ├── connectors/          # 【External: 办公连接器】
│   │   ├── feishu/          # 飞书多维表格/文档接入
│   │   ├── notion/          # Notion 接入
│   │   └── parser/          # 指令解析引擎 (Doc-to-Skill)
│   │
│   ├── memory/              # 【Memory: 记忆系统】
│   │   ├── store/           # 本地持久化 (IndexedDB/Sync)
│   │   ├── timeline.ts      # 实现你图中的 Year/Month/Day 索引逻辑
│   │   └── vector.ts        # 向量记忆接入 (RAG 准备)
│   │
│   ├── skills/              # 【Plugins: 技能与 MCP】
│   │   ├── registry.ts      # 技能注册表 (万物皆可插拔的核心)
│   │   ├── mcp/             # MCP 协议实现 (连接本地/私有数据)
│   │   └── official/        # 官方内置技能包
│   │
│   └── shared/              # 【Shared: 通用层】
│       ├── types/           # 全局 TypeScript 接口
│       ├── constants/       # 配置与常量
│       └── utils/           # 工具函数
│
├── wxt.config.ts            # 扩展配置
├── package.json
└── tsconfig.json

### CoTabor 阶梯式感知与执行架构设计 (Cascade Perception & Execution Architecture) 核心设计思想：快慢双通道分离
本架构彻底解耦了“廉价的文本 DOM 感知（快通道）”与“昂贵的多模态视觉感知（慢通道）”，利用 LangGraph 的拓扑结构，将视觉能力封装为一个专治疑难杂症的“局部抢救子图（Cortex）”。
 一、 模块与节点职责划分
1. 主干道：DOM 快速推进模式 (PageAgent 思想)

- 执行环境 ： Planner -> Executor
- 感知方式 ：通过轻量级 JS 脚本注入页面，提取精简、扁平化的 DOM 树，并为交互元素打上数字索引。
- 大模型调用 ：使用廉价且快速的纯文本大模型（如 Qwen-Plus）。
- 优势 ：极快的响应速度和极低的 Token 成本，能处理 90% 规范的网页交互。
2. 审计者：状态守门员

- 执行环境 ： Watchdog
- 核心职责 ：评估 Executor 执行的动作是否达到了预期（如：元素是否出现、页面是否跳转、DOM 解析是否报错）。
- 路由决策 ：
  - 成功 ：放行回 Planner 继续下一步（主干道循环）。
  - 失败 ：拦截流程，将错误上下文打包，抛给 Cortex 节点。
3. 抢救室：视觉微操子图 (Midscene 思想)

- 执行环境 ： Cortex (作为一个自带重试机制的 Sub-Graph)
- 触发条件 ：收到 Watchdog 的失败报告（例如：DOM 里找不到特定按钮，或者连续点击无效）。
- 工作流 ：
  - 视觉感知 ：调用 CDP 截取浏览器全屏高清截图。
  - 多模态诊断 ：将截图和失败原因发给昂贵的多模态大模型（如 GPT-4o / Claude-3.5-Sonnet），请求它用视觉寻找目标并返回物理坐标。
  - 物理执行 ：根据坐标执行纯粹的物理层点击/输入（避开 DOM 层面的限制）。
  - 局部验证 ：执行后验证是否修复了当前的阻塞。
- 路由出口（双向出口） ：
  - 成功抢救 (Exit A) ：局部的障碍已扫除（例如下拉菜单终于被点开了）。 Cortex 将控制权 切回 Planner 。系统自动降级回便宜的 DOM 模式继续后续任务。（即“用完即切回”）。
  - 抢救失败 (Exit B) ：在 Cortex 内部尝试了 N 次视觉微操依然无效（例如页面处于白屏崩溃状态）。 Cortex 判定局部修补无望，将流程 升级抛给 Replanner 。
4. 战略重构室：全局兜底

- 执行环境 ： Replanner
- 触发条件 ：收到 Cortex 抢救彻底失败的信号。
- 核心职责 ：推翻之前的全部微观操作计划，站在宏观角度重新制定策略（例如：决定刷新页面、回退历史、或者直接放弃该任务并通知用户）。 二、 架构优势总结
1. 成本控制极致化 ：平时完全不消耗昂贵的多模态 Token，只有在真正需要时（Watchdog 报错），才精准动用“重型武器”。
2. 逻辑极度清晰 ： Planner 和 Cortex 各司其职。 Planner 的代码里不需要写复杂的 if (domFailed) useVision() 这种恶心的面条代码，一切由 LangGraph 的图边（Edges）优雅调度。
3. 强大的容错闭环 ： Planner (常态推进) -> Cortex (局部抢救) -> Replanner (全局重构)，构成了从轻到重、从微观到宏观的三级容错体系。