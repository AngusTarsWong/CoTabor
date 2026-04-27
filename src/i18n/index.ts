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
import koCommon from './locales/ko/common.json';
import koSidepanel from './locales/ko/sidepanel.json';
import koWelcome from './locales/ko/welcome.json';
import koOptions from './locales/ko/options.json';
import deCommon from './locales/de/common.json';
import deSidepanel from './locales/de/sidepanel.json';
import deWelcome from './locales/de/welcome.json';
import deOptions from './locales/de/options.json';
import frCommon from './locales/fr/common.json';
import frSidepanel from './locales/fr/sidepanel.json';
import frWelcome from './locales/fr/welcome.json';
import frOptions from './locales/fr/options.json';
import jaCommon from './locales/ja/common.json';
import jaSidepanel from './locales/ja/sidepanel.json';
import jaWelcome from './locales/ja/welcome.json';
import jaOptions from './locales/ja/options.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '中文' },
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
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
      ko: {
        common: koCommon,
        sidepanel: koSidepanel,
        welcome: koWelcome,
        options: koOptions,
      },
      de: {
        common: deCommon,
        sidepanel: deSidepanel,
        welcome: deWelcome,
        options: deOptions,
      },
      fr: {
        common: frCommon,
        sidepanel: frSidepanel,
        welcome: frWelcome,
        options: frOptions,
      },
      ja: {
        common: jaCommon,
        sidepanel: jaSidepanel,
        welcome: jaWelcome,
        options: jaOptions,
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
