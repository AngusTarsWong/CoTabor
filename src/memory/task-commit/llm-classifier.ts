import { getAgentLangInstruction } from "../../i18n/agent-lang";
import { invokeLLM, TokenUsage } from "../../shared/utils/llm-stream";
import { ClassifiedMemory, MemoryCandidate } from "../../shared/types/memory";
import { createLlmClient, getLaneModelName } from "../../shared/llm/provider";

function parseJson<T>(raw: string, fallback: T): T {
  const clean = (raw || "").trim().replace(/^```json/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

export class TaskMemoryClassifier {
  getModelName(): string {
    return getLaneModelName("planner");
  }

  async classifyCandidate(candidate: MemoryCandidate): Promise<{ memory: ClassifiedMemory; tokenUsage: TokenUsage }> {
    // createLlmClient with background scope handles loadDynamicConfig() internally.
    const llm = await createLlmClient("planner", "background", { temperature: 0.1, maxTokens: 500, timeout: 30000, maxRetries: 1 });
    const modelName = getLaneModelName("planner");
    const isAntiPattern = candidate.isAntiPattern === true;

    const langInstruction = await getAgentLangInstruction();
    const systemPrompt = `你是 CoTabor 的记忆分类与蒸馏器。你的任务是把候选经验分类为 L1、L2、L3 或 DROP，并输出标准化 JSON。

    分类规则：
    - L1：页面操作经验。关注页面元素、点击、输入、等待、DOM 交互技巧。
    - L2：工具调用经验。关注 skill、API、MCP、参数约束、调用修正规则。
    - L3：任务策略经验。关注任务级 SOP、规划步骤、整体避坑方法。对于来自「蜂群协作策略复盘」的候选，应分类为 L3，并识别其为 swarm 类型。
    - DROP：一次性观察、噪声、不可复用、信息不足。

    输出要求：
    - 只输出 JSON，不要输出 Markdown。
    - memoryText 必须是精炼后的正式记忆文本，去掉任务过程噪声。
    - confidence 范围 0 到 1。
    - 对于 L3 记忆，增加 "sourceType" 字段：
    - 如果经验描述单体操作，填 "agent"。
    - 如果描述多 Agent 协作或 DAG 并发策略，填 "swarm"，并尽量在 "dagPattern" 中归约出节点和依赖。
    - 对 L3，请尽量补全 title、taskType、domainScope、language、keywords。
    - scope 中仅保留和本条记忆真正相关的字段。
    - memoryType 字段：正向经验填 "positive"，失败反模式填 "anti_pattern"。${langInstruction}`;

    const antiPatternHint = isAntiPattern
      ? `\n⚠️ 注意：这条经验来自失败任务，是「反模式」教训。应分类为 L3（任务策略层），memoryText 使用反向指令（如「不要先...，应先...」），memoryType 必须填 "anti_pattern"。`
      : "";

    const userPrompt = `任务目标：
    ${candidate.goal}

    候选经验来源：${candidate.source}${antiPatternHint}
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
    "memoryType": "positive | anti_pattern",
    "sourceType": "agent | swarm",
    "dagPattern": {
    "nodes": [{"intent": "子任务意图", "role": "角色描述"}],
    "dependencies": "依赖描述"
    },
    "scope": {
    "domain": "",
    "path": "",
    "skillName": "",
    "taskType": ""
    }
    }`;

    const { content, tokenUsage } = await invokeLLM(
      llm,
      [["system", systemPrompt], ["human", userPrompt]],
      "memory_commit",
      modelName,
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
      memoryType: isAntiPattern ? 'anti_pattern' : 'positive',
      scope: {
        domain: candidate.domain,
        path: candidate.path,
        skillName: candidate.skillName,
        taskType: "",
      },
    });

    // Ensure anti-pattern candidates always carry the correct memoryType,
    // even if the LLM forgot to set it.
    const resolvedMemoryType: 'positive' | 'anti_pattern' =
      isAntiPattern ? 'anti_pattern' : (parsed.memoryType ?? 'positive');

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
        memoryType: resolvedMemoryType,
        sourceType: parsed.sourceType || 'agent',
        dagPattern: parsed.dagPattern,
        scope: parsed.scope || {},
      },
      tokenUsage,
    };
  }
}
