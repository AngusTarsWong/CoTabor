import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { LANGUAGES, findLanguage } from './languages';

export { LANGUAGES, findLanguage };

/** Convenience list for UI components that only need code + label. */
export const SUPPORTED_LANGUAGES = LANGUAGES.map(l => ({ code: l.code, label: l.label }));

const NAMESPACES = ['common', 'sidepanel', 'welcome', 'options'] as const;

async function detectLanguage(): Promise<string> {
  try {
    const result = await chrome.storage.local.get('language');
    if (result.language) return result.language as string;
  } catch {
    // not in extension context
  }

  const browserLang =
    typeof chrome !== 'undefined' && chrome.i18n
      ? chrome.i18n.getUILanguage()
      : navigator.language;

  return findLanguage(browserLang)?.code ?? 'en';
}

export async function initI18n(): Promise<void> {
  const lng = await detectLanguage();

  await i18n
    .use(resourcesToBackend(
      (lang: string, ns: string) => import(`./locales/${lang}/${ns}.json`)
    ))
    .use(initReactI18next)
    .init({
      lng,
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: NAMESPACES,
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
