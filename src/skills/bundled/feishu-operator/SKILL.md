---
name: feishu_operator
description: 全能的飞书（Lark）系统专家。当你需要读取特定文档正文内容、搜索库内文档、或创建新文档时，请调用此技能模块。
role: action
type: local
params:
  instruction: "string - 具体的自然语言指令（例如：'搜索关于 CoTabor 的文档并总结'，'帮我读取 doc_id 为 yyy 的内容'，'将这段文字写飞书里创建文档'）"
---
# Agent 使用指南 (Prompt)

这是 CoTabor 的「无界飞书专家」。你在此模块中不需要了解飞书的具体 API 内部结构。
只要用户的指令意图中包含：阅读飞书、查找飞书、向飞书写数据，你**必须**优先调用此技能。

## 使用规则
1. 参数 `instruction` 必须是清晰的目标描述。
2. 该技能会在后台自动连接飞书原生大模型协议（MCP），执行拉取和写入，最终返回给你一段执行完毕的结果文本或 Markdown 格式的文档数据。
3. 如果返回报错提示需要凭证（Auth），请告知用户在 `.env` 中配置 `LARK_APP_ID` 和 `LARK_APP_SECRET`。
