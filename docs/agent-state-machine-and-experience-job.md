# Agent 状态机与后台经验任务设计

## 1. 目标

本设计用于解决以下三个问题：

1. 主任务的“单步失败”和“整轮终止失败”语义混淆。
2. 后台经验总结已经异步化，但事件流仍混入主工作流 UI。
3. 工作流 UI 过度依赖 LLM step，导致 `executor` / `watchdog(rule_based)` 等系统节点缺失。

设计目标：

- 主任务完成后立即释放输入框，允许用户开始下一轮对话。
- 经验总结作为后台任务独立执行，不阻塞主任务交付。
- 主任务工作流只展示主链节点，后台经验任务只展示轻量状态。
- `finish` 结果稳定回填到最终消息框。

---

## 2. 状态机约束

### 2.1 主任务终态

主任务层只认三个终态：

- `FINISHED`
- `FAILED`
- `STOPPED`

只有进入这三个终态，`ClawAgent` 才允许：

- 停止消费 graph stream
- 做任务收尾
- 触发 `onFinish` / `onError` / `onStopped`
- 调度后台经验任务

### 2.2 单步失败不是终态

`executor` 的技术失败只表示：

- 当前动作失败
- 需要交给 `watchdog` 审计
- 再决定是进入 `cortex` 恢复、`replanner` 重规划，还是最终失败

因此：

- `executor` 普通失败不应直接把主状态写成 `FAILED`
- 应保留为运行态，并把错误信息写入 `error` 与 `total_history`
- 最终由 `watchdog / cortex / replanner / graph` 决定是否终止

### 2.3 finish 的真正落点

`planner` / `replanner` 产出 `action.type === "finish"` 时，只表示：

- 模型建议结束任务

真正的任务完成应统一在 `executor` 落地：

- `executor` 处理 `finish`
- 返回 `status = "FINISHED"`
- graph 再基于该终态结束

这样可避免：

- `planner` 过早把状态标成 `FINISHED`
- `ClawAgent._processStream()` 提前结束，导致后续节点结果丢失

---

## 3. 主任务链与后台经验链

### 3.1 主任务链职责

主任务链只负责：

1. `memory`
2. `planner`
3. `executor`
4. `watchdog`
5. `cortex`
6. `replanner`
7. 返回用户最终结果

主任务链结束后：

- 写本地 `task_run`
- 写本地 `raw_trace`
- 设置 `experienceStatus = PENDING`
- 异步调度后台经验任务

### 3.2 后台经验链职责

后台经验任务只负责：

1. 读取 `task_run + raw_trace`
2. 调用总结模型生成经验摘要
3. 提取候选经验
4. 分类为 `L1 / L2 / L3 / DROP`
5. 写本地正式记忆
6. 同步 `TaskRuns / SyncLog`
7. 更新 `experienceStatus`

后台经验任务不属于 LangGraph 主执行链。

---

## 4. 后台经验任务状态

`task_run` 维护以下后台经验状态字段：

- `experienceStatus`
  - `PENDING`
  - `RUNNING`
  - `SUCCEEDED`
  - `FAILED`

- `experienceStartedAt`
- `experienceFinishedAt`
- `experienceError`
- `experienceRetryCount`

同步状态单独维护：

- `cloudSyncStatus`
  - `pending`
  - `synced`
  - `failed`

这两个状态层不要混用：

- `experienceStatus` 代表经验提炼是否完成
- `cloudSyncStatus` 代表云端同步是否完成

---

## 5. 事件流隔离

### 5.1 主任务事件

主任务内的 LLM 调用使用默认 `scope = "main"`，这些事件可以进入：

- `useAppLogs`
- `ChatWorkspace`
- `ProcessPanel`

### 5.2 后台经验事件

后台经验任务的 LLM 调用使用：

- `scope = "background"`

这些事件不能进入主工作流 UI。

后台经验任务只通过 `experience-job` 事件总线对 UI 暴露轻量状态：

- `queued`
- `running`
- `completed`
- `failed`

对应 UI 只展示：

- `经验任务已加入后台处理队列`
- `经验总结处理中...`
- `经验已保存：L1 x · L2 x · L3 x`
- `TaskRuns / SyncLog 已同步到 Notion`
- `经验总结失败，等待重试`

---

## 6. 工作流 UI 规则

### 6.1 展示来源

主工作流卡片的节点展示，以 graph `onStep` 写入的 `workflowNodes` 为主。

`llm-step` 的作用仅用于补充：

- 模型名
- token
- 时长
- 流式输出

不能再由 `llm-step` 单独决定一个节点是否显示。

### 6.2 需要始终可见的主链节点

只要执行过，下列节点都应可见：

- `memory`
- `planner`
- `executor`
- `watchdog`
- `cortex`
- `replanner`
- `human`

即使它们没有 LLM 事件，也不能在 UI 中消失。

### 6.3 后台经验任务不进入主工作流

`experience_job` 不应再出现在：

- `Agent 工作流`
- `ProcessPanel`
- 主任务节点树

如果后续需要查看经验详情，应绑定：

- `task_run`
- 或后台经验任务结果对象

不再绑定主工作流节点。

---

## 7. 最终结果消息框

最终结果消息框只在真正终态时生成：

- `FINISHED` -> `onFinish`
- `FAILED` -> `onError`
- `STOPPED` -> `onStopped`

用户最终可见的结果文本来源优先级：

1. `planner_output.action.result`
2. `finish` 动作在 `total_history` 里的结果
3. 最近有效的 `step_summary`

如果只是模型中间输出了 `finish`，但主任务尚未真正完成，不应提前写入最终消息框。

---

## 8. 后续扩展建议

后续如需继续增强，可沿此架构演进：

1. 给后台经验任务增加独立详情面板，直接读取 `task_run`
2. 把 `raw_trace` 从“任务结束统一落盘”升级为“运行中实时落盘”
3. 为 `TaskRuns` 加入更细粒度的审计字段
4. 把工作流轮次划分规则从日志驱动进一步升级为节点树驱动

---

## 9. 三层记忆检索策略

### 9.1 总体原则

三层记忆不再共用一套检索手段：

- `L1`：结构化精确检索
- `L2`：结构化规则检索
- `L3`：BM25 + 结构化字段过滤/重排

当前版本已删除：

- 云端 embedding 生成
- 本地向量索引
- 向量维度初始化与重建链路

这样可以降低：

- 插件体积和审核复杂度
- 运行时初始化失败概率
- 记忆系统的调试复杂度

### 9.2 L1 检索

L1 保留为页面操作经验：

- 匹配键：`domain + pathPattern + actionType + elementSelector`
- 排序：路径匹配度 + 执行次数 + 成功率

L1 不使用 BM25。原因是它属于规则命中，而不是自然语言语义召回。

### 9.3 L2 检索

L2 保留为 skill / API / MCP 调用规则：

- 匹配键：`skillName + ruleType + contextScope`
- 排序：命中次数 + 成功次数 + 更新时间

L2 同样不使用 BM25。它更适合规则匹配和字段增强。

### 9.4 L3 检索

L3 改为：

- 主存储：`IndexedDB / l3_tactical`
- 检索引擎：`wink-bm25-text-search`
- 索引字段：
  - `title`
  - `keywords`
  - `intentQuery`
  - `tacticalRules`
- 重排字段：
  - `taskType`
  - `domainScope`
  - `language`
  - `usageCount`
  - `successCount`
  - `updatedAt`

L3 不再依赖 embedding 或向量索引。

### 9.5 L3 预处理策略

L3 查询和文档统一走轻量预处理层：

1. 文本归一化
- Unicode `NFKC`
- 小写化
- 去 URL、冗余空白和标点噪音

2. 语言分组
- `latin`
- `cjk`
- `other`

3. tokenization
- `latin`：按单词切分
- `cjk`：单字 + bigram
- `other`：简单切分 / 字符级回退

首版不引入重型分词库或语言模型。

### 9.6 L3 索引生命周期

L3 BM25 索引是当前会话内的内存索引：

- sidepanel 启动时异步 `warmup()`
- 检索前 `ensureReady()`
- 本地 L3 写入后 `rebuild()`
- 云端拉回 L3 后 `rebuild()`

与旧向量方案不同的是：

- 没有 embedding 维度约束
- 没有模型下载和向量化初始化
- 只需要保证 BM25 索引与 IndexedDB 保持一致

### 9.7 经验输出要求

为保证 BM25 效果，后台经验任务在产出 `L3` 时必须尽量补齐：

- `title`
- `taskType`
- `domainScope`
- `language`
- `keywords`
- `tacticalRules`

如果模型未补齐：

- `keywords` 由本地预处理层回退生成
- `language` 由脚本级检测回退推断

该文档应与以下模块同步维护：

- `src/lib/claw/agent.ts`
- `src/core/graph/graph.ts`
- `src/core/graph/nodes/*`
- `src/memory/experience-job/*`
- `src/memory/retrieval/*`
- `src/sidepanel/hooks/useAppLogs.ts`
- `src/sidepanel/components/antx/ChatWorkspace.tsx`
