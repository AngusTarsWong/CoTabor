declare module "wink-bm25-text-search" {
  interface WinkBm25Engine {
    defineConfig(config: any): void;
    definePrepTasks(tasks: Array<(input: any) => any>, field?: string): number;
    addDoc(doc: Record<string, any>, uniqueId: string | number): void;
    consolidate(fp?: number): void;
    search(
      text: string,
      limit?: number,
      filter?: (doc: Record<string, any>, params: any) => boolean,
      params?: any
    ): Array<[string | number, number]>;
    exportJSON(): string;
    importJSON(json: string): void;
    reset(): void;
  }

  export default function winkBm25(): WinkBm25Engine;
}

