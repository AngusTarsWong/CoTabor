/**
 * PageAgentAdapter — 使用 @page-agent/page-controller 增强 DOM 提取
 *
 * 依赖：npm install @page-agent/page-controller
 *
 * getFlatTree() 运行在页面上下文中（DOM API），需要通过 CDP evaluate() 注入执行。
 * 返回值中的 HTMLElement ref 字段在序列化时会被过滤掉。
 *
 * waitFor / locateElement 继承 NativeAdapter（不由 PageAgent 处理）。
 */

import { CdpTools } from '../../../cdp/tools';
import { NativeAdapter } from '../native';
import { ExtractedDOM, DOMElement } from '../../types';

// 注入页面的自执行脚本
// 使用 @page-agent/page-controller 的核心提取算法
// 需要在构建时将 @page-agent/page-controller 打包为可注入的 IIFE
const buildInjectionScript = (): string => `
  (() => {
    try {
      // @page-agent/page-controller getFlatTree 核心逻辑
      // 此脚本在构建时由 PageAgent 包提供，运行在页面上下文
      if (typeof __PAGE_AGENT_GET_FLAT_TREE__ === 'function') {
        const tree = __PAGE_AGENT_GET_FLAT_TREE__({
          viewportOnly: false,
          interactiveOnly: false,
        });
        // 序列化时过滤掉不可传递的 HTMLElement ref
        return JSON.stringify(tree, (key, val) =>
          key === 'ref' ? undefined : val
        );
      }
      return null;
    } catch (e) {
      return null;
    }
  })()
`;

export class PageAgentAdapter extends NativeAdapter {
  async extractDOM(tabId: number): Promise<ExtractedDOM> {
    const cdp = new CdpTools(tabId);

    try {
      const rawJson = await cdp.evaluate<string | null>(buildInjectionScript());

      if (rawJson) {
        const tree = JSON.parse(rawJson);
        return this.convertFlatTreeToExtractedDOM(tree, cdp);
      }
    } catch (e) {
      console.warn('[PageAgentAdapter] getFlatTree injection failed, falling back to NativeAdapter:', e);
    }

    // 降级到 NativeAdapter 的 DOMDriver
    return super.extractDOM(tabId);
  }

  private async convertFlatTreeToExtractedDOM(
    tree: any,
    cdp: CdpTools
  ): Promise<ExtractedDOM> {
    const pageTitle = await cdp.evaluate<string>('document.title');
    const pageUrl   = await cdp.evaluate<string>('window.location.href');

    const elements: DOMElement[] = [];
    const contentLines: string[] = [];
    let index = 0;

    const nodes: any[] = tree?.map ? Object.values(tree.map) : [];

    for (const node of nodes) {
      if (!node.isVisible) continue;

      if (node.isInteractive && node.highlightIndex !== undefined) {
        elements.push({
          index: index++,
          tagName: node.tagName?.toLowerCase() || 'unknown',
          role: node.attributes?.role || null,
          text: (node.attributes?.innerText || node.attributes?.value || '').substring(0, 100),
          placeholder: node.attributes?.placeholder || null,
          bounds: {
            x: node.rect?.left ?? 0,
            y: node.rect?.top ?? 0,
            width: node.rect?.width ?? 0,
            height: node.rect?.height ?? 0,
          },
        });
      } else if (node.type === 'TEXT_NODE' && node.text?.trim().length > 5) {
        contentLines.push(node.text.trim().substring(0, 200));
      }
    }

    const visibleText = contentLines.slice(0, 50).join('\n');

    let simplifiedText = `Page: ${pageTitle}\nURL: ${pageUrl}\n`;
    if (visibleText) simplifiedText += `\nPage Content:\n${visibleText}\n`;
    simplifiedText += '\nInteractive Elements:\n';
    for (const el of elements) {
      let desc = `[${el.index}] <${el.tagName}`;
      if (el.role) desc += ` role="${el.role}"`;
      desc += `>`;
      if (el.text) desc += ` ${el.text.replace(/\n/g, ' ')}`;
      if (el.placeholder) desc += ` (placeholder: ${el.placeholder})`;
      simplifiedText += desc + '\n';
    }

    return { elements, pageTitle, pageUrl, visibleText, simplifiedText };
  }
}
