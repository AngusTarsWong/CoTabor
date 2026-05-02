export type DocBlock =
  | { type: 'heading'; level: 1 | 2 | 3; content: string; bold?: boolean }
  | { type: 'paragraph'; content: string; italic?: boolean }
  | { type: 'bullet'; content: string }
  | { type: 'code'; content: string }
  | { type: 'divider' }
  | { type: 'image'; base64: string; mimeType?: string };

/**
 * Backend document contract, similar in spirit to `TableOperator`.
 * `parentRef` is an opaque backend-specific identifier:
 * Feishu uses a folder token and Notion uses a parent page ID.
 */
export interface DocumentProvider {
  createDocument(title: string, parentRef?: string): Promise<string>;
  appendContent(documentId: string, blocks: DocBlock[]): Promise<void>;
  findDocument(parentRef: string, name: string): Promise<string | null>;
  getDocumentUrl(documentId: string): string;
}
