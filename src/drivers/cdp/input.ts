 /**
 * 基于 CDP 的输入能力封装
 * 提供极简的鼠标点击、键盘输入能力
 */
import { cdpClient } from './index';

export class CdpInput {
  private tabId: number;

  constructor(tabId: number) {
    this.tabId = tabId;
  }

  /**
   * 在指定坐标进行鼠标左键点击
   */
  async click(x: number, y: number) {
    // 鼠标移动到目标位置
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });
    
    // 短暂延迟模拟真实人类操作
    await new Promise(r => setTimeout(r, 50));

    // 鼠标按下
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    
    // 短暂延迟
    await new Promise(r => setTimeout(r, 50));

    // 鼠标抬起
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  /**
   * 极简的文本输入
   */
  async typeText(text: string) {
    for (const char of text) {
      // 触发 keydown
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });
      // 触发 char (实际输入)
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: char,
      });
      // 触发 keyup
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
      // 短暂延迟
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /**
   * 极简的页面滚动
   */
  async scroll(deltaX: number, deltaY: number) {
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 0,
      y: 0,
      deltaX,
      deltaY,
    });
  }
}
