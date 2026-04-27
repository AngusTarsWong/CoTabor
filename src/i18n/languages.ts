import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import koKR from 'antd/locale/ko_KR';
import deDE from 'antd/locale/de_DE';
import frFR from 'antd/locale/fr_FR';
import jaJP from 'antd/locale/ja_JP';
import type { Locale } from 'antd/es/locale';

export interface LanguageConfig {
  code: string;
  label: string;
  antdLocale: Locale;
  /** Appended to LLM system prompts so agent output matches UI language. Empty string = no instruction (default Chinese). */
  agentInstruction: string;
}

export const LANGUAGES: LanguageConfig[] = [
  {
    code: 'zh-CN',
    label: '中文',
    antdLocale: zhCN,
    agentInstruction: '',
  },
  {
    code: 'en',
    label: 'English',
    antdLocale: enUS,
    agentInstruction: `\n\nLANGUAGE INSTRUCTION: You must respond ENTIRELY in English.\nAll reasoning, plans, action descriptions, summaries, and outputs must be written in English.`,
  },
  {
    code: 'ko',
    label: '한국어',
    antdLocale: koKR,
    agentInstruction: `\n\n언어 지침: 모든 응답을 반드시 한국어로 작성해야 합니다.\n모든 추론, 계획, 행동 설명, 요약 및 출력은 한국어로 작성되어야 합니다.`,
  },
  {
    code: 'de',
    label: 'Deutsch',
    antdLocale: deDE,
    agentInstruction: `\n\nSPRACHANWEISUNG: Sie müssen ausschließlich auf Deutsch antworten.\nAlle Überlegungen, Pläne, Aktionsbeschreibungen, Zusammenfassungen und Ausgaben müssen auf Deutsch verfasst sein.`,
  },
  {
    code: 'fr',
    label: 'Français',
    antdLocale: frFR,
    agentInstruction: `\n\nINSTRUCTION DE LANGUE : Vous devez répondre entièrement en français.\nTous les raisonnements, plans, descriptions d'actions, résumés et sorties doivent être rédigés en français.`,
  },
  {
    code: 'ja',
    label: '日本語',
    antdLocale: jaJP,
    agentInstruction: `\n\n言語指示：すべての応答を日本語で行ってください。\nすべての推論、計画、アクションの説明、要約、および出力は日本語で記述してください。`,
  },
];

/** Finds a language config by exact code or language prefix (e.g. "en-US" → "en"). */
export function findLanguage(code: string): LanguageConfig | undefined {
  return (
    LANGUAGES.find(l => l.code === code) ??
    LANGUAGES.find(l => code.startsWith(l.code.split('-')[0]))
  );
}
