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
    const translated: object[] = [];
    for (const block of blocks) {
      if (block.type === 'image') {
        const fileToken = await this.uploadImage(token, documentId, block.base64, block.mimeType ?? 'image/jpeg');
        if (fileToken) {
          translated.push({ block_type: 27, image: { token: fileToken } });
        }
      } else {
        translated.push(this.translateBlock(block));
      }
    }
    if (translated.length > 0) {
      await appendBlocks(token, documentId, translated);
    }
  }

  async findDocument(parentRef: string, name: string): Promise<string | null> {
    const token = await getLarkToken(this.appId, this.appSecret);
    return findFileInFolder(token, parentRef, name);
  }

  getDocumentUrl(documentId: string): string {
    return `https://www.feishu.cn/docx/${documentId}`;
  }

  private async uploadImage(token: string, documentId: string, base64: string, mimeType: string): Promise<string | null> {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const blob = new Blob([bytes], { type: mimeType });

      const form = new FormData();
      form.append('file_name', `screenshot.${ext}`);
      form.append('parent_type', 'docx_image');
      form.append('parent_node', documentId);
      form.append('size', String(bytes.length));
      form.append('file', blob, `screenshot.${ext}`);

      const res = await fetch('https://open.feishu.cn/open-apis/drive/v1/medias/upload_all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      return data.code === 0 ? (data.data?.file_token ?? null) : null;
    } catch {
      return null;
    }
  }

  private translateBlock(block: Exclude<DocBlock, { type: 'image' }>): object {
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
