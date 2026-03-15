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