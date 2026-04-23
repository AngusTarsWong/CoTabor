import { DocumentProvider, DocBlock } from '../../types/document-provider';
import { getLarkToken, findFileInFolder, createDocument, appendBlocks } from '../lark-utils';

export class FeishuDocumentProvider implements DocumentProvider {
  constructor(private appId: string, private appSecret: string) {}

  async createDocument(title: string, parentRef?: string): Promise<string> {
    const token = await getLarkToken(this.appId, this.appSecret);
    return createDocument(token, parentRef ?? '', title);
  }

  async appendContent(documentId: string, blocks: DocBlock[]): Promise<void> {
    const token = await getLarkToken(this.appId, this.appSecret);
    await appendBlocks(token, documentId, blocks.map(b => this.translateBlock(b)));
  }

  async findDocument(parentRef: string, name: string): Promise<string | null> {
    const token = await getLarkToken(this.appId, this.appSecret);
    return findFileInFolder(token, parentRef, name);
  }

  getDocumentUrl(documentId: string): string {
    return `https://www.feishu.cn/docx/${documentId}`;
  }

  private translateBlock(block: DocBlock): object {
    switch (block.type) {
      case 'heading': {
        const typeMap: Record<number, number> = { 1: 3, 2: 4, 3: 5 };
        const dataKey = `heading${block.level}`;
        return {
          block_type: typeMap[block.level],
          [dataKey]: { elements: [{ text_run: { content: block.content, text_element_style: { bold: block.bold ?? true } } }] },
        };
      }
      case 'paragraph':
        return {
          block_type: 2,
          text: { elements: [{ text_run: { content: block.content, text_element_style: { italic: block.italic ?? false } } }] },
        };
      case 'bullet':
        return { block_type: 12, bullet: { elements: [{ text_run: { content: block.content } }] } };
      case 'code':
        return { block_type: 14, code: { elements: [{ text_run: { content: block.content } }], language: 15 } };
      case 'divider':
        return { block_type: 22, divider: {} };
    }
  }
}
