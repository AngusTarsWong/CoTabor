import { DocumentProvider, DocBlock } from '../../types/document-provider';
import { FeishuDocumentProvider } from './feishu-document-provider';
import { NotionDocumentProvider } from './notion-document-provider';
import { extractNotionPageId } from '../../../skills/bundled/notion-operator/init';
import { storageAdapter } from '../../../runner/storage-adapter';
import { ENV } from '../../constants/env';

export class DocumentService implements DocumentProvider {
  private static instance: DocumentService | null = null;
  private provider: DocumentProvider;
  private backend: 'feishu' | 'notion';

  private constructor(provider: DocumentProvider, backend: 'feishu' | 'notion') {
    this.provider = provider;
    this.backend = backend;
  }

  /** Return the singleton instance, or `null` when no backend is configured. */
  static async getInstance(): Promise<DocumentService | null> {
    if (DocumentService.instance) return DocumentService.instance;
    const result = await DocumentService.resolveProvider();
    if (!result) return null;
    DocumentService.instance = new DocumentService(result.provider, result.backend);
    return DocumentService.instance;
  }

  /** Reset the singleton so the next `getInstance()` re-resolves the backend. */
  static reset(): void {
    DocumentService.instance = null;
  }

  /**
   * Return the default parent reference for a given purpose.
   * Feishu uses a folder token; Notion uses a parent page ID.
   */
  async getDefaultFolder(purpose: 'logs' | 'sites' | 'tasks'): Promise<string> {
    if (this.backend === 'feishu') {
      const map = { logs: ENV.LARK_LOGS_FOLDER, sites: ENV.LARK_SITES_FOLDER, tasks: ENV.LARK_TASKS_FOLDER };
      return map[purpose];
    }
    // Keep Notion logs and memory docs under the shared BrainBase parent page.
    const stored = await storageAdapter.get(['notionParentPageUrl']);
    return extractNotionPageId(stored.notionParentPageUrl ?? '');
  }

  // Delegate the `DocumentProvider` contract to the resolved backend provider.

  createDocument(title: string, parentRef?: string): Promise<string> {
    return this.provider.createDocument(title, parentRef);
  }

  appendContent(documentId: string, blocks: DocBlock[]): Promise<void> {
    return this.provider.appendContent(documentId, blocks);
  }

  findDocument(parentRef: string, name: string): Promise<string | null> {
    return this.provider.findDocument(parentRef, name);
  }

  getDocumentUrl(documentId: string): string {
    return this.provider.getDocumentUrl(documentId);
  }

  // Resolve the backing provider. New backends only need an extra branch here.

  private static async resolveProvider(): Promise<{ provider: DocumentProvider; backend: 'feishu' | 'notion' } | null> {
    const stored = await storageAdapter.get([
      'storageBackend',
      'larkAppId',
      'larkAppSecret',
      'notionApiKey',
      'notionParentPageUrl',
    ]);
    const backend: 'feishu' | 'notion' = stored.storageBackend ?? 'feishu';

    if (backend === 'feishu') {
      const appId = stored.larkAppId || ENV.LARK_APP_ID;
      const appSecret = stored.larkAppSecret || ENV.LARK_APP_SECRET;
      if (!appId || !appSecret) {
        console.warn('[DocumentService] Feishu credentials missing, document backend unavailable.');
        return null;
      }
      return { provider: new FeishuDocumentProvider(appId, appSecret), backend };
    }

    if (backend === 'notion') {
      const apiKey = stored.notionApiKey ?? '';
      const parentUrl = stored.notionParentPageUrl ?? '';
      if (!apiKey || !parentUrl) {
        console.warn('[DocumentService] Notion credentials or parent page missing, document backend unavailable.');
        return null;
      }
      const parentId = extractNotionPageId(parentUrl);
      return { provider: new NotionDocumentProvider(apiKey, parentId), backend };
    }

    console.warn('[DocumentService] Unknown storageBackend:', backend);
    return null;
  }
}
