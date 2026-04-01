
export interface LoggerConfig {
  goal: string;
  tabId: number;
  timestamp: number;
}

export interface IAgentLogger {
  /**
   * 初始化日志会话，通常涉及创建文件或连接服务
   */
  init(config: LoggerConfig): Promise<void>;

  /**
   * 记录一个节点的执行步进
   * @param step 包含 nodeName 和 stateUpdate 的对象
   */
  logStep(step: { node: string; update: any }): Promise<void>;

  /**
   * 任务结束时的清理或状态更新
   * @param finalState 最终状态
   */
  finish(finalState: any): Promise<void>;

  /**
   * 获取日志的访问链接（可选）
   */
  getLogUrl?(): string;
}
