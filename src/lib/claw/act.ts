/**
 * Action Module
 * Performs low-level actions using CDP.
 */

import { cdp } from "./cdp";

export const act = {
  /**
   * Click at specific coordinates
   */
  click: async (tabId: number, x: number, y: number) => {
    // Mouse Pressed
    await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });

    // Mouse Released
    await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  },

  /**
   * Type text into the focused element
   */
  type: async (tabId: number, text: string) => {
    // Use insertText for simplicity and reliability
    await cdp.sendCommand(tabId, "Input.insertText", {
      text,
    });
  },

  /**
   * Scroll the page
   */
  scroll: async (tabId: number, deltaX: number, deltaY: number) => {
      await cdp.sendCommand(tabId, "Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: 0,
          y: 0,
          deltaX,
          deltaY,
      });
  }
};
