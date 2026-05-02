 /**
 * Lightweight input helpers backed by CDP events.
 */
import { cdpClient } from './index';

export class CdpInput {
  private tabId: number;

  constructor(tabId: number) {
    this.tabId = tabId;
  }

  /** Dispatch a left-click at the given viewport coordinates. */
  async click(x: number, y: number) {
    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });
    
    await new Promise(r => setTimeout(r, 50));

    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    
    await new Promise(r => setTimeout(r, 50));

    await cdpClient.send(this.tabId, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
  }

  /** Type text by sending keyDown, char, and keyUp for each character. */
  async typeText(text: string) {
    for (const char of text) {
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: char,
      });
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'char',
        text: char,
      });
      await cdpClient.send(this.tabId, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        text: char,
      });
      await new Promise(r => setTimeout(r, 20));
    }
  }

  /** Dispatch a wheel event. */
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
