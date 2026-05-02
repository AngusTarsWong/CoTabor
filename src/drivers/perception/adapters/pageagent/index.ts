/**
 * PageAgent-backed DOM extraction adapter.
 *
 * Dependency: `npm install @page-agent/page-controller`
 *
 * `getFlatTree()` runs in the page context and must be injected through CDP
 * evaluation. The non-serializable `HTMLElement ref` field is stripped out.
 *
 * `waitFor` and `locateElement` fall back to `NativeAdapter`.
 */

import { CdpTools } from '../../../cdp/tools';
import { NativeAdapter } from '../native';
import { ExtractedDOM, DOMElement } from '../../types';

// Self-executing script injected into the page context.
// The PageAgent package provides the `getFlatTree` implementation as an IIFE.
const buildInjectionScript = (): string => `
  (() => {
    try {
      // Core getFlatTree logic bundled from @page-agent/page-controller.
      if (typeof __PAGE_AGENT_GET_FLAT_TREE__ === 'function') {
        const tree = __PAGE_AGENT_GET_FLAT_TREE__({
          viewportOnly: false,
          interactiveOnly: false,
        });
        // Remove non-transferable DOM references before crossing the boundary.
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

    // Fall back to the native DOM driver when injection fails.
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

    // Include viewport size so the model can reason about coordinates.
    let viewportWidth = 1280;
    let viewportHeight = 800;
    try {
      const layout = await cdp.getLayout();
      viewportWidth = layout.width;
      viewportHeight = layout.height;
    } catch (_) {}

    let simplifiedText = `Page: ${pageTitle}\nURL: ${pageUrl}\nViewport: ${viewportWidth}x${viewportHeight}\n`;
    if (visibleText) simplifiedText += `\nPage Content:\n${visibleText}\n`;
    simplifiedText += '\nInteractive Elements:\n';
    for (const el of elements) {
      // Surface element center coordinates directly in the text prompt.
      const centerX = Math.round((el.bounds?.x ?? 0) + (el.bounds?.width ?? 0) / 2);
      const centerY = Math.round((el.bounds?.y ?? 0) + (el.bounds?.height ?? 0) / 2);
      let desc = `[${el.index}] <${el.tagName}`;
      if (el.role) desc += ` role="${el.role}"`;
      desc += ` coord="${centerX},${centerY}"`;
      desc += `>`;
      if (el.text) desc += ` ${el.text.replace(/\n/g, ' ')}`;
      if (el.placeholder) desc += ` (placeholder: ${el.placeholder})`;
      simplifiedText += desc + '\n';
    }

    return { elements, pageTitle, pageUrl, visibleText, simplifiedText };
  }
}
