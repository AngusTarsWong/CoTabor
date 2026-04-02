
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

export interface IAgentMemory {
  /**
   * 按域名更新网站经验。文件名应为域名。
   * @param domain 网站域名 (如 news.google.com)
   * @param insights 提炼出的经验列表
   */
  upsertSiteMemory(domain: string, insights: string[]): Promise<void>;

  /**
   * 更新任务 SOP（最佳实践）。
   * @param goal 任务目标 (作为文件名)
   * @param wisdom 提炼出的方法论列表
   */
  upsertTaskSOP(goal: string, wisdom: string[]): Promise<void>;
}
