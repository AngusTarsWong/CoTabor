const LATIN_WORD_RE = /[a-z0-9]+/gi;
const CJK_CHAR_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

function normalizeText(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeLatin(text: string): string[] {
  return normalizeText(text).match(LATIN_WORD_RE) || [];
}

function tokenizeCjk(text: string): string[] {
  const normalized = normalizeText(text);
  const chars = Array.from(normalized).filter((char) => CJK_CHAR_RE.test(char));
  if (chars.length === 0) return [];

  const tokens: string[] = [...chars];
  for (let i = 0; i < chars.length - 1; i += 1) {
    tokens.push(`${chars[i]}${chars[i + 1]}`);
  }
  return tokens;
}

export function tokenizeText(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return [...tokenizeLatin(normalized), ...tokenizeCjk(normalized)];
}

export function uniqueNormalizedTokens(parts: Array<string | undefined | null>): string[] {
  const tokens = new Set<string>();
  parts.forEach((part) => {
    tokenizeText(part || "").forEach((token) => tokens.add(token));
  });
  return [...tokens];
}

export function inferLanguage(parts: Array<string | undefined | null>): string {
  const joined = parts.filter(Boolean).join(" ");
  if (!joined.trim()) return "unknown";
  return CJK_CHAR_RE.test(joined) ? "cjk" : "latin";
}

