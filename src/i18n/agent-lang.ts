const AGENT_LANG_INSTRUCTIONS: Record<string, string> = {
  'zh-CN': '',
  'en': `

LANGUAGE INSTRUCTION: You must respond ENTIRELY in English.
All reasoning, plans, action descriptions, summaries, and outputs must be written in English.`,
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
