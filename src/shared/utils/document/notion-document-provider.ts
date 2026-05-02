import { DocumentProvider, DocBlock } from '../../types/document-provider';
import { notionFetch, formatId } from '../../../skills/bundled/notion-operator/init';

export class NotionDocumentProvider implements DocumentProvider {
  constructor(private apiKey: string, private defaultParentId: string) {}

  async createDocument(title: string, parentRef?: string): Promise<string> {
    const parentId = formatId(parentRef ?? this.defaultParentId);
    const data = await notionFetch(this.apiKey, 'POST', '/pages', {
      parent: { type: 'page_id', page_id: parentId },
      properties: { title: [{ text: { content: title } }] },
    });
    return (data.id as string).replace(/-/g, '');
  }

  async appendContent(pageId: string, blocks: DocBlock[]): Promise<void> {
    const translated: object[] = [];
    for (const block of blocks) {
      if (block.type === 'image') {
        const imageBlock = await this.buildImageBlock(block.base64, block.mimeType ?? 'image/jpeg');
        if (imageBlock) translated.push(imageBlock);
      } else {
        translated.push(this.translateBlock(block));
      }
    }
    // Notion accepts at most 100 blocks per append request.
    for (let i = 0; i < translated.length; i += 100) {
      await notionFetch(this.apiKey, 'PATCH', `/blocks/${formatId(pageId)}/children`, {
        children: translated.slice(i, i + 100),
      });
    }
  }

  async findDocument(parentRef: string, name: string): Promise<string | null> {
    let startCursor: string | undefined;
    while (true) {
      const url = `/blocks/${formatId(parentRef)}/children` + (startCursor ? `?start_cursor=${startCursor}` : '');
      const data: any = await notionFetch(this.apiKey, 'GET', url);
      for (const block of data.results ?? []) {
        if (block.type === 'child_page' && block.child_page?.title === name) {
          return (block.id as string).replace(/-/g, '');
        }
      }
      if (!data.has_more) break;
      startCursor = data.next_cursor;
    }
    return null;
  }

  getDocumentUrl(pageId: string): string {
    return `https://www.notion.so/${pageId.replace(/-/g, '')}`;
  }

  /**
   * Upload an image to Notion File Storage and return the `file_upload_id`.
   * Returns `null` on failure so image blocks can be skipped safely.
   *
   * Flow:
   *   1. POST /files/upload to get `upload_url` and `file_upload_id`
   *   2. PUT the binary payload to `upload_url`
   *   3. Reference the uploaded file via `file_upload.id`
   */
  private async uploadImageToNotion(base64: string, mimeType: string): Promise<string | null> {
    try {
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const fileName = `screenshot.${ext}`;

      // Step 1: request an upload slot.
      const uploadRequest: any = await notionFetch(this.apiKey, 'POST', '/files/upload', {
        name: fileName,
      });
      const fileUploadId: string | undefined = uploadRequest.id;
      const uploadUrl: string | undefined = uploadRequest.upload_url;
      if (!fileUploadId || !uploadUrl) return null;

      // Step 2: convert base64 to binary and upload as multipart form data.
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const form = new FormData();
      form.append('file', blob, fileName);

      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
      });
      if (!res.ok) return null;

      return fileUploadId;
    } catch {
      return null;
    }
  }

  private async buildImageBlock(base64: string, mimeType: string): Promise<object | null> {
    const fileUploadId = await this.uploadImageToNotion(base64, mimeType);
    if (!fileUploadId) return null;
    return {
      object: 'block',
      type: 'image',
      image: { type: 'file_upload', file_upload: { id: fileUploadId } },
    };
  }

  private translateBlock(block: Exclude<DocBlock, { type: 'image' }>): object {
    switch (block.type) {
      case 'heading': {
        const key = `heading_${block.level}`;
        return {
          object: 'block',
          type: key,
          [key]: {
            rich_text: [{ type: 'text', text: { content: block.content }, annotations: { bold: block.bold ?? true } }],
          },
        };
      }
      case 'paragraph':
        return {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: block.content }, annotations: { italic: block.italic ?? false } }],
          },
        };
      case 'bullet':
        return {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ type: 'text', text: { content: block.content } }] },
        };
      case 'code':
        return {
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: block.content } }],
            language: 'plain text',
          },
        };
      case 'divider':
        return { object: 'block', type: 'divider', divider: {} };
    }
  }
}
