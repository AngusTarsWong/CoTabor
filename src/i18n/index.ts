import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCNCommon from './locales/zh-CN/common.json';
import zhCNSidepanel from './locales/zh-CN/sidepanel.json';
import zhCNWelcome from './locales/zh-CN/welcome.json';
import zhCNOptions from './locales/zh-CN/options.json';
import enCommon from './locales/en/common.json';
import enSidepanel from './locales/en/sidepanel.json';
import enWelcome from './locales/en/welcome.json';
import enOptions from './locales/en/options.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
];

async function detectLanguage(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('language');
    if (result.language) return result.language;
  } catch {
    // not in extension context
  }

  const browserLang = typeof chrome !== 'undefined' && chrome.i18n
    ? chrome.i18n.getUILanguage()
    : navigator.language;

  const supported = SUPPORTED_LANGUAGES.map(l => l.code);
  if (supported.includes(browserLang)) return browserLang;

  const prefix = supported.find(c => browserLang.startsWith(c.split('-')[0]));
  return prefix ?? 'en';
}

export async function initI18n(): Promise<void> {
  const lng = await detectLanguage();

  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'sidepanel', 'welcome', 'options'],
    resources: {
      'zh-CN': {
        common: zhCNCommon,
        sidepanel: zhCNSidepanel,
        welcome: zhCNWelcome,
        options: zhCNOptions,
      },
      en: {
        common: enCommon,
        sidepanel: enSidepanel,
        welcome: enWelcome,
        options: enOptions,
      },
    },
    interpolation: { escapeValue: false },
  });
}

export async function changeLanguage(lang: string): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await chrome.storage.local.set({ language: lang });
  } catch {
    // not in extension context
  }
}

export default i18n;
