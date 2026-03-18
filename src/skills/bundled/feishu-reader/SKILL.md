---
name: feishu_read_doc
description: 提取并结构化读取当前飞书文档（Doc/Docx）的正文内容。
role: action
type: local
metadata:
  gating:
    url_pattern: ".*://.*.feishu.cn/docx/.*"
params:
  format: "enum: ['markdown', 'raw_text'] - 希望返回的内容格式"
---
# Agent 使用指南
当用户要求你总结当前飞书文档、查找文档内信息时，必须优先使用此技能。
注意：此技能不需要传入 URL，它会自动读取用户当前正在浏览的 Tab 页。
如果返回 "AUTH_REQUIRED"，请降级使用 CDP Action 引导用户登录。