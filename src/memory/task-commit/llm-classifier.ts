import { ChatOpenAI } from "@langchain/openai";
import { ENV } from "../../shared/constants/env";
import { invokeLLM, TokenUsage } from "../../shared/utils/llm-stream";
import { ClassifiedMemory, MemoryCandidate } from "../../shared/types/memory";

function parseJson<T>(raw: string, fallback: T): T {
  const clean = (raw || "").trim().replace(/^```json/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

export class TaskMemoryClassifier {
  private llm: ChatOpenAI;
  private modelName: string;

  constructor() {
    const config = ENV.PLANNER_CONFIG;
    this.modelName = config.modelName;
    this.llm = new ChatOpenAI({
      apiKey: config.apiKey,
      configuration: { baseURL: config.baseUrl },
      modelName: config.modelName,
      temperature: 0.1,
      maxTokens: 500,
      timeout: 30000,
      maxRetries: 1,
    });
  }

  getModelName(): string {
    return this.modelName;
  }

  async classifyCandidate(candidate: MemoryCandidate): Promise<{ memory: ClassifiedMemory; tokenUsage: TokenUsage }> {
    const systemPrompt = `你是 CoTabor 的记忆分类与蒸馏器。你的任务是把候选经验分类为 L1、L2、L3 或 DROP，并输出标准化 JSON。

分类规则：
- L1：页面操作经验。关注页面元素、点击、输入、等待、DOM 交互技巧。
- L2：工具调用经验。关注 skill、API、MCP、参数约束、调用修正规则。
- L3：任务策略经验。关注任务级 SOP、规划步骤、整体避坑方法。
- DROP：一次性观察、噪声、不可复用、信息不足。

输出要求：
- 只输出 JSON，不要输出 Markdown。
- memoryText 必须是精炼后的正式记忆文本，去掉任务过程噪声。
- confidence 范围 0 到 1。
- 对 L3，请尽量补全 title、taskType、domainScope、language、keywords。
- scope 中仅保留和本条记忆真正相关的字段。`;

    const userPrompt = `任务目标：
${candidate.goal}

候选经验来源：${candidate.source}
候选经验文本：
${candidate.text}

候选上下文：
${JSON.stringify({
  domain: candidate.domain || "",
  path: candidate.path || "",
  skillName: candidate.skillName || "",
}, null, 2)}

最近证据：
${(candidate.evidence || []).join("\n") || "无"}

请判断这条经验属于 L1、L2、L3 还是 DROP，并输出 JSON：
{
  "level": "L1 | L2 | L3 | DROP",
  "title": "一句话标题",
  "memoryText": "蒸馏后的正式记忆文本",
  "reason": "分类原因",
  "confidence": 0.0,
  "keywords": ["关键词1", "关键词2"],
  "language": "cjk | latin | other",
  "domainScope": "",
  "scope": {
    "domain": "",
    "path": "",
    "skillName": "",
    "taskType": ""
  }
}`;

    const { content, tokenUsage } = await invokeLLM(
      this.llm,
      [["system", systemPrompt], ["human", userPrompt]],
      "memory_commit",
      this.modelName,
      "background"
    );

    const parsed = parseJson<Omit<ClassifiedMemory, "candidateId">>(content, {
      level: "DROP",
      title: candidate.text.slice(0, 24),
      memoryText: candidate.text,
      reason: "模型输出无法解析，保守丢弃。",
      confidence: 0,
      keywords: [],
      language: "",
      domainScope: candidate.domain,
      scope: {
        domain: candidate.domain,
        path: candidate.path,
        skillName: candidate.skillName,
        taskType: "",
      },
    });

    return {
      memory: {
        candidateId: candidate.id,
        level: parsed.level,
        title: parsed.title,
        memoryText: parsed.memoryText,
        reason: parsed.reason,
        confidence: parsed.confidence,
        keywords: parsed.keywords || [],
        language: parsed.language || "",
        domainScope: parsed.domainScope || candidate.domain,
        scope: parsed.scope || {},
      },
      tokenUsage,
    };
  }
}
