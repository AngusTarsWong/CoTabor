import { L3TacticalMemory } from "../../shared/types/memory";
import { l3Bm25Index, L3SearchOptions } from "./l3-bm25-index";

export async function retrieveL3Memories(query: string, options: L3SearchOptions = {}): Promise<L3TacticalMemory[]> {
  if (!query.trim()) return [];
  return l3Bm25Index.search(query, options);
}

