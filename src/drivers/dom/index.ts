import { CdpTools } from '../cdp/tools';
import { CdpInput } from '../cdp/input';

export interface DOMElement {
  index: number;
  tagName: string;
  role: string | null;
  text: string;
  placeholder: string | null;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ExtractedDOM {
  elements: DOMElement[];
  pageTitle: string;
  pageUrl: string;
  visibleText: string;
  simplifiedText: string;
}

export class DOMDriver {
  private tabId: number;
  private cdpTools: CdpTools;
  private cdpInput: CdpInput;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.cdpTools = new CdpTools(tabId);
    this.cdpInput = new CdpInput(tabId);
  }

  /**
   * Extract full page context in one CDP round-trip:
   * visible content plus interactive elements for the planner.
   */
  async extractDOM(): Promise<ExtractedDOM> {
    const script = `
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };

        const isInteractive = (el) => {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'option';
          return isClickable || el.onclick != null || window.getComputedStyle(el).cursor === 'pointer';
        };

        // --- Interactive Elements ---
        const elements = [];
        let index = 0;
        const allNodes = document.querySelectorAll('*');
        for (const el of allNodes) {
          if (isVisible(el) && isInteractive(el)) {
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || el.value || '').trim().substring(0, 100);
            const placeholder = el.getAttribute('placeholder') || null;
            const ariaLabel = el.getAttribute('aria-label') || null;
            if (!text && !placeholder && !ariaLabel && el.tagName.toLowerCase() !== 'input') continue;
            elements.push({
              index: index++,
              tagName: el.tagName.toLowerCase(),
              role: el.getAttribute('role'),
              text: text || ariaLabel || '',
              placeholder: placeholder,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            });
          }
        }

        // --- Visible Page Content (headings, paragraphs, list items, table cells) ---
        const seenText = new Set();
        const contentLines = [];
        let totalChars = 0;
        const contentSelectors = 'h1, h2, h3, h4, p, li, td, th';
        for (const el of document.querySelectorAll(contentSelectors)) {
          if (totalChars >= 2000) break;
          if (!isVisible(el)) continue;
          // Skip elements inside interactive containers (they're covered by interactive elements)
          if (el.closest('button, a, [role="button"], [role="link"], nav, [role="navigation"]')) continue;
          const text = el.innerText?.trim();
          if (!text || text.length < 8 || seenText.has(text)) continue;
          seenText.add(text);
          const tag = el.tagName.toLowerCase();
          const truncated = text.substring(0, 300);
          contentLines.push({ tag, text: truncated });
          totalChars += truncated.length;
        }

        return {
          elements,
          pageTitle: document.title,
          pageUrl: window.location.href,
          contentLines
        };
      })();
    `;

    const raw = await this.cdpTools.evaluate<{
      elements: DOMElement[];
      pageTitle: string;
      pageUrl: string;
      contentLines: { tag: string; text: string }[];
    }>(script);

    const elements: DOMElement[] = raw?.elements || [];
    const pageTitle = raw?.pageTitle || '';
    const pageUrl = raw?.pageUrl || '';
    const contentLines = raw?.contentLines || [];

    // --- Build visibleText ---
    let visibleText = '';
    for (const line of contentLines) {
      if (line.tag === 'h1' || line.tag === 'h2') {
        visibleText += `\n## ${line.text}\n`;
      } else if (line.tag === 'h3' || line.tag === 'h4') {
        visibleText += `\n### ${line.text}\n`;
      } else if (line.tag === 'li') {
        visibleText += `- ${line.text}\n`;
      } else {
        visibleText += `${line.text}\n`;
      }
    }

    // --- Build simplifiedText (what Planner sees) ---
    let simplifiedText = `Page: ${pageTitle}\nURL: ${pageUrl}\n`;

    if (visibleText.trim()) {
      simplifiedText += `\nPage Content:\n${visibleText.trim()}\n`;
    }

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

  /** Click using raw viewport coordinates. */
  async clickByCoordinate(x: number, y: number): Promise<void> {
    await this.cdpInput.click(x, y);
  }

  /** Click an element from the current DOM snapshot by its index. */
  async clickByIndex(elements: DOMElement[], index: number): Promise<void> {
    const target = elements.find(e => e.index === index);
    if (!target) {
      throw new Error(`Element with index ${index} not found in current DOM snapshot.`);
    }

    try {
      await this.cdpTools.evaluate(`
        (() => {
          let currentIdx = 0;
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const isInteractive = (el) => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'option';
            return isClickable || el.onclick != null || window.getComputedStyle(el).cursor === 'pointer';
          };
          for (const el of document.querySelectorAll('*')) {
            if (isVisible(el) && isInteractive(el)) {
              const text = (el.innerText || el.value || '').trim().substring(0, 100);
              const placeholder = el.getAttribute('placeholder') || null;
              const ariaLabel = el.getAttribute('aria-label') || null;
              if (!text && !placeholder && !ariaLabel && el.tagName.toLowerCase() !== 'input') continue;

              if (currentIdx === ${index}) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                return;
              }
              currentIdx++;
            }
          }
        })();
      `);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn("Failed to scroll element into view", e);
    }

    const newBoundsClick = await this.cdpTools.evaluate<any>(`
      (() => {
        let currentIdx = 0;
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const isInteractive = (el) => {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'option';
          return isClickable || el.onclick != null || window.getComputedStyle(el).cursor === 'pointer';
        };
        for (const el of document.querySelectorAll('*')) {
          if (isVisible(el) && isInteractive(el)) {
            const text = (el.innerText || el.value || '').trim().substring(0, 100);
            const placeholder = el.getAttribute('placeholder') || null;
            const ariaLabel = el.getAttribute('aria-label') || null;
            if (!text && !placeholder && !ariaLabel && el.tagName.toLowerCase() !== 'input') continue;
            if (currentIdx === ${index}) {
              const rect = el.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            currentIdx++;
          }
        }
        return null;
      })();
    `).catch(() => null);

    let centerX = target.bounds.x + target.bounds.width / 2;
    let centerY = target.bounds.y + target.bounds.height / 2;
    if (newBoundsClick) {
      centerX = newBoundsClick.x + newBoundsClick.width / 2;
      centerY = newBoundsClick.y + newBoundsClick.height / 2;
    }

    await this.clickByCoordinate(centerX, centerY);
  }

  /** Type into an element from the current DOM snapshot by its index. */
  async typeByIndex(elements: DOMElement[], index: number, text: string): Promise<void> {
    const target = elements.find(e => e.index === index);
    if (!target) {
      throw new Error(`Element with index ${index} not found in current DOM snapshot.`);
    }

    try {
      await this.cdpTools.evaluate(`
        (() => {
          let currentIdx = 0;
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const isInteractive = (el) => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'option';
            return isClickable || el.onclick != null || window.getComputedStyle(el).cursor === 'pointer';
          };
          for (const el of document.querySelectorAll('*')) {
            if (isVisible(el) && isInteractive(el)) {
              const text = (el.innerText || el.value || '').trim().substring(0, 100);
              const placeholder = el.getAttribute('placeholder') || null;
              const ariaLabel = el.getAttribute('aria-label') || null;
              if (!text && !placeholder && !ariaLabel && el.tagName.toLowerCase() !== 'input') continue;
              if (currentIdx === ${index}) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                return;
              }
              currentIdx++;
            }
          }
        })();
      `);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn("Failed to scroll element into view", e);
    }

    const newBoundsType = await this.cdpTools.evaluate<any>(`
      (() => {
        let currentIdx = 0;
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const isInteractive = (el) => {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role');
          const isClickable = tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || tag === 'textarea' || role === 'button' || role === 'link' || role === 'menuitem' || role === 'option';
          return isClickable || el.onclick != null || window.getComputedStyle(el).cursor === 'pointer';
        };
        for (const el of document.querySelectorAll('*')) {
          if (isVisible(el) && isInteractive(el)) {
            const text = (el.innerText || el.value || '').trim().substring(0, 100);
            const placeholder = el.getAttribute('placeholder') || null;
            const ariaLabel = el.getAttribute('aria-label') || null;
            if (!text && !placeholder && !ariaLabel && el.tagName.toLowerCase() !== 'input') continue;
            if (currentIdx === ${index}) {
              const rect = el.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            currentIdx++;
          }
        }
        return null;
      })();
    `).catch(() => null);

    let centerX = target.bounds.x + target.bounds.width / 2;
    let centerY = target.bounds.y + target.bounds.height / 2;
    if (newBoundsType) {
      centerX = newBoundsType.x + newBoundsType.width / 2;
      centerY = newBoundsType.y + newBoundsType.height / 2;
    }

    // Focus before typing so subsequent key events land on the expected element.
    await this.clickByCoordinate(centerX, centerY);
    await new Promise(r => setTimeout(r, 200));
    await this.cdpInput.typeText(text);
  }
}
