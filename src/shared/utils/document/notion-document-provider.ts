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
    const translated = blocks.map(b => this.translateBlock(b));
    // Notion 单次最多 100 blocks
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

  private translateBlock(block: DocBlock): object {
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
