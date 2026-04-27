const AGENT_LANG_INSTRUCTIONS: Record<string, string> = {
  'zh-CN': '',
  'en': `

LANGUAGE INSTRUCTION: You must respond ENTIRELY in English.
All reasoning, plans, action descriptions, summaries, and outputs must be written in English.`,
  'ko': `

언어 지침: 모든 응답을 반드시 한국어로 작성해야 합니다.
모든 추론, 계획, 행동 설명, 요약 및 출력은 한국어로 작성되어야 합니다.`,
  'de': `

SPRACHANWEISUNG: Sie müssen ausschließlich auf Deutsch antworten.
Alle Überlegungen, Pläne, Aktionsbeschreibungen, Zusammenfassungen und Ausgaben müssen auf Deutsch verfasst sein.`,
  'fr': `

INSTRUCTION DE LANGUE : Vous devez répondre entièrement en français.
Tous les raisonnements, plans, descriptions d'actions, résumés et sorties doivent être rédigés en français.`,
  'ja': `

言語指示：すべての応答を日本語で行ってください。
すべての推論、計画、アクションの説明、要約、および出力は日本語で記述してください。`,
};

export async function getAgentLangInstruction(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('language');
    const lang = result.language as string | undefined;
    if (lang && AGENT_LANG_INSTRUCTIONS[lang] !== undefined) {
      return AGENT_LANG_INSTRUCTIONS[lang];
    }
    // Attempt prefix match (e.g. "en-US" → "en")
    if (lang) {
      const prefix = Object.keys(AGENT_LANG_INSTRUCTIONS).find(k => lang.startsWith(k.split('-')[0]));
      if (prefix) return AGENT_LANG_INSTRUCTIONS[prefix];
    }
  } catch {
    // not in extension context or storage unavailable
  }
  return '';
}
