import { MemoryItem, L3WorkflowMeta } from "../../shared/types/memory";
import { l3Bm25Index } from "./l3-bm25-index";
import type { L3SearchOptions } from "./l3-bm25-index";

export async function retrieveL3Items(query: string, options: L3SearchOptions = {}): Promise<MemoryItem[]> {
  if (!query.trim()) return [];
  return l3Bm25Index.search(query, options);
}
