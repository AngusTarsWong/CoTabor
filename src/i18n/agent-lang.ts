import { findLanguage } from './languages';

export async function getAgentLangInstruction(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('language');
    const lang = result.language as string | undefined;
    return findLanguage(lang ?? '')?.agentInstruction ?? '';
  } catch {
    // not in extension context or storage unavailable
  }
  return '';
}
