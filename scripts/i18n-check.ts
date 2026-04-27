/**
 * i18n key consistency checker.
 * Uses "en" as the baseline and reports any keys missing in other languages.
 * Run: npx tsx scripts/i18n-check.ts
 */
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.resolve(__dirname, '../src/i18n/locales');
const BASE_LANG = 'en';
const NAMESPACES = ['common', 'sidepanel', 'welcome', 'options'];

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? flattenKeys(v as Record<string, unknown>, full)
      : [full];
  });
}

function readJson(lang: string, ns: string): Record<string, unknown> | null {
  const file = path.join(LOCALES_DIR, lang, `${ns}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
}

const languages = fs.readdirSync(LOCALES_DIR).filter(d =>
  fs.statSync(path.join(LOCALES_DIR, d)).isDirectory()
);

let hasError = false;

for (const ns of NAMESPACES) {
  const base = readJson(BASE_LANG, ns);
  if (!base) {
    console.error(`❌ Missing baseline: ${BASE_LANG}/${ns}.json`);
    hasError = true;
    continue;
  }
  const baseKeys = flattenKeys(base);

  for (const lang of languages) {
    if (lang === BASE_LANG) continue;
    const data = readJson(lang, ns);
    if (!data) {
      console.error(`❌ Missing file: ${lang}/${ns}.json`);
      hasError = true;
      continue;
    }
    const langKeys = new Set(flattenKeys(data));
    const missing = baseKeys.filter(k => !langKeys.has(k));
    if (missing.length > 0) {
      console.error(`❌ ${lang}/${ns}.json — missing ${missing.length} key(s):`);
      missing.forEach(k => console.error(`     • ${k}`));
      hasError = true;
    }
  }
}

if (!hasError) {
  console.log(`✅ All languages have complete keys across ${NAMESPACES.length} namespaces.`);
} else {
  process.exit(1);
}
