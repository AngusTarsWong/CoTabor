// 定义回放事件类型，参考 midsense
export interface PlaybackEvent {
  type: 'screenshot' | 'log' | 'action' | 'error';
  content: string; // 截图是 base64，日志是文本，动作是描述
  timestamp: number;
  // 额外字段用于更丰富的回放
  actionType?: 'click' | 'input' | 'scroll' | 'navigation';
  screenshot?: string; // 如果 type 是 action，这里可以放操作后的截图
  elementRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
