export const MAX_SMALL_BM25_COLLECTION_DOCS = 5;

export function shouldUseSmallCollectionFallback(docCount: number): boolean {
  return docCount <= MAX_SMALL_BM25_COLLECTION_DOCS;
}
