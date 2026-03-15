
import { CdpTools } from "../../drivers/cdp/tools";

/**
 * 飞书文档连接器
 * 
 * 这是一个高级模块，用于处理飞书文档的特殊交互逻辑。
 * 它封装了“如何读取飞书文档”的知识，例如：
 * 1. 自动滚动懒加载内容
 * 2. 识别文档结构（标题、目录等）
 * 3. 处理多维表格（未来扩展）
 */

// 简单的滚动脚本实现，后续可以替换为更复杂的逻辑
async function autoScrollAndRead(cdpTools: CdpTools): Promise<string> {
  console.log('[FeishuConnector] Starting auto-scroll sequence...');
  
  // 在浏览器中执行滚动脚本
  const content = await cdpTools.evaluate<string>(`
    (async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      
      // 尝试找到主要滚动容器，通常是 window 或者 .document-editor
      // 这里简化处理，直接滚动 window
      let lastHeight = document.body.scrollHeight;
      let noChangeCount = 0;
      
      // 最大滚动尝试次数，防止死循环
      for(let i=0; i<30; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await wait(800); // 等待内容加载
        
        const newHeight = document.body.scrollHeight;
        if(newHeight === lastHeight) {
          noChangeCount++;
          if(noChangeCount >= 3) break; // 连续3次高度没变，认为到底了
        } else {
          noChangeCount = 0;
          lastHeight = newHeight;
        }
      }
      
      // 提取内容
      // 优先提取编辑器区域，如果找不到则提取 body
      const editor = document.querySelector('.document-editor') || 
                     document.querySelector('.bear-editor') || 
                     document.body;
                     
      return editor.innerText;
    })()
  `);
  
  return content || "";
}

export const FeishuBrowserConnector = {
  /**
   * 判断当前 URL 是否是飞书文档
   */
  isFeishuUrl(url: string): boolean {
    if (!url) return false;
    return url.includes('feishu.cn/docs') || url.includes('larksuite.com/docs');
  },

  /**
   * 读取文档内容（包含自动滚动逻辑）
   */
  async readDocument(tabId: number): Promise<string> {
    const cdpTools = new CdpTools(tabId);
    
    // 1. 获取文档标题
    const title = await cdpTools.evaluate<string>('document.title');
    
    // 2. 执行自动滚动并获取全文
    const content = await autoScrollAndRead(cdpTools);
    
    // 3. 组装返回结果
    return `[Feishu Doc: ${title}]\n\n${content}`;
  }
};
