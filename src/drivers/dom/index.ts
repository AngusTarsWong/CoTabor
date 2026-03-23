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
  simplifiedText: string;
}

export class DOMDriver {
  private cdpTools: CdpTools;
  private cdpInput: CdpInput;

  constructor(tabId: number) {
    this.cdpTools = new CdpTools(tabId);
    this.cdpInput = new CdpInput(tabId);
  }

  /**
   * 提取页面上可交互的扁平化 DOM 结构 (PageAgent 思想)
   * 给可见的、可交互的元素打上 index，并返回其坐标和文本信息
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

        const elements = [];
        let index = 0;
        
        // 遍历所有元素
        const allNodes = document.querySelectorAll('*');
        for (const el of allNodes) {
          if (isVisible(el) && isInteractive(el)) {
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || el.value || '').trim().substring(0, 100);
            const placeholder = el.getAttribute('placeholder') || null;
            const ariaLabel = el.getAttribute('aria-label') || null;
            
            // 如果既没有文本也没有 placeholder/aria-label，可能是一些无用的包裹元素，跳过（或者保留如果它是按钮）
            if (!text && !placeholder && !ariaLabel && el.tagName.toLowerCase() !== 'input') continue;

            elements.push({
              index: index++,
              tagName: el.tagName.toLowerCase(),
              role: el.getAttribute('role'),
              text: text || ariaLabel || '',
              placeholder: placeholder,
              bounds: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            });
          }
        }
        
        return elements;
      })();
    `;

    const result = await this.cdpTools.evaluate<DOMElement[]>(script);
    const elements: DOMElement[] = result || [];

    // 组装用于给 LLM 看的精简文本
    let simplifiedText = 'Interactive Elements:\n';
    for (const el of elements) {
      let desc = `[${el.index}] <${el.tagName}`;
      if (el.role) desc += ` role="${el.role}"`;
      desc += `>`;
      if (el.text) desc += ` ${el.text.replace(/\n/g, ' ')}`;
      if (el.placeholder) desc += ` (placeholder: ${el.placeholder})`;
      simplifiedText += desc + '\n';
    }

    return {
      elements,
      simplifiedText
    };
  }

  /**
   * 根据坐标执行纯粹的物理层点击
   */
  async clickByCoordinate(x: number, y: number): Promise<void> {
    await this.cdpInput.click(x, y);
  }

  /**
   * 根据元素索引执行点击
   */
  async clickByIndex(elements: DOMElement[], index: number): Promise<void> {
    const target = elements.find(e => e.index === index);
    if (!target) {
      throw new Error(`Element with index ${index} not found in current DOM snapshot.`);
    }
    // 获取中心点坐标
    const centerX = target.bounds.x + target.bounds.width / 2;
    const centerY = target.bounds.y + target.bounds.height / 2;
    await this.clickByCoordinate(centerX, centerY);
  }

  /**
   * 根据元素索引执行输入
   */
  async typeByIndex(elements: DOMElement[], index: number, text: string): Promise<void> {
    const target = elements.find(e => e.index === index);
    if (!target) {
      throw new Error(`Element with index ${index} not found in current DOM snapshot.`);
    }
    const centerX = target.bounds.x + target.bounds.width / 2;
    const centerY = target.bounds.y + target.bounds.height / 2;
    // 点击聚焦
    await this.clickByCoordinate(centerX, centerY);
    // 延迟一下
    await new Promise(r => setTimeout(r, 200));
    // 输入文本
    await this.cdpInput.typeText(text);
  }
}
