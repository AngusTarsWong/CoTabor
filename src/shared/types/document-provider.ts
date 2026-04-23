export type DocBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: string; bold?: boolean }
  | { type: 'paragraph'; content: string; italic?: boolean }
  | { type: 'bullet'; content: string }
  | { type: 'code'; content: string }
  | { type: 'divider' }
  | { type: 'image'; base64: string; mimeType?: string };

/** 底层文档契约，类比 TableOperator。parentRef 为不透明字符串：Feishu 传 folder_token，Notion 传 parent page ID。 */
export interface DocumentProvider {
  createDocument(title: string, parentRef?: string): Promise<string>;
  appendContent(documentId: string, blocks: DocBlock[]): Promise<void>;
  findDocument(parentRef: string, name: string): Promise<string | null>;
  getDocumentUrl(documentId: string): string;
}
