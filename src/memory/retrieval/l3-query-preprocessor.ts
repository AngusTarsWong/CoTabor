import { inferLanguage, tokenizeText, uniqueNormalizedTokens } from "./tokenize";

export interface L3PreprocessInput {
  query: string;
  domainScope?: string;
  taskType?: string;
}

export interface L3PreprocessResult {
  normalizedQuery: string;
  queryTokens: string[];
  language: string;
  domainScope?: string;
  taskType?: string;
}

export interface L3StructuredFields {
  title: string;
  intentQuery: string;
  tacticalRules: string;
  keywords?: string[];
  domainScope?: string;
  taskType?: string;
  language?: string;
}

function normalizeText(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "\"")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function preprocessL3Query(input: L3PreprocessInput): L3PreprocessResult {
  const normalizedQuery = normalizeText(input.query);
  return {
    normalizedQuery,
    queryTokens: tokenizeText(normalizedQuery),
    language: inferLanguage([normalizedQuery]),
    domainScope: input.domainScope,
    taskType: input.taskType,
  };
}

export function buildL3Keywords(fields: L3StructuredFields): string[] {
  if (fields.keywords && fields.keywords.length > 0) {
    return uniqueNormalizedTokens(fields.keywords);
  }

  return uniqueNormalizedTokens([
    fields.title,
    fields.intentQuery,
    fields.tacticalRules,
    fields.taskType,
    fields.domainScope,
  ]).slice(0, 24);
}

export function inferL3Language(fields: L3StructuredFields): string {
  return fields.language || inferLanguage([fields.title, fields.intentQuery, fields.tacticalRules]);
}

