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

  /** 获取单例。未配置后端凭证时返回 null，调用方应优雅降级。 */
  static async getInstance(): Promise<DocumentService | null> {
    if (DocumentService.instance) return DocumentService.instance;
    const result = await DocumentService.resolveProvider();
    if (!result) return null;
    DocumentService.instance = new DocumentService(result.provider, result.backend);
    return DocumentService.instance;
  }

  /** 后端切换时调用，下次 getInstance() 将重新初始化。 */
  static reset(): void {
    DocumentService.instance = null;
  }

  /**
   * 返回指定用途的默认文档父目录引用。
   * Feishu 返回 folder_token，Notion 返回 parent page ID。
   * 调用方无需感知后端差异。
   */
  async getDefaultFolder(purpose: 'logs' | 'sites' | 'tasks'): Promise<string> {
    if (this.backend === 'feishu') {
      const map = { logs: ENV.LARK_LOGS_FOLDER, sites: ENV.LARK_SITES_FOLDER, tasks: ENV.LARK_TASKS_FOLDER };
      return map[purpose];
    }
    // Notion：日志/记忆文档统一挂在 BrainBase 父页面下
    const stored = await storageAdapter.get(['notionParentPageUrl']);
    return extractNotionPageId(stored.notionParentPageUrl ?? '');
  }

  // ── DocumentProvider 接口（全部委托给内部 provider）─────────────────────

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

  // ── 内部 provider 解析（新增后端只需在此处加 case）─────────────────────

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
