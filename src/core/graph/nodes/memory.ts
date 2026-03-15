import { AgentState } from "../state";

export const memoryNode = async (state: AgentState): Promise<Partial<AgentState>> => {
  console.log("--- [Node: Memory Compressor] ---");

  const { total_history, long_term_memory, request } = state;
  const threshold = 3; // 测试环境降低阈值，每 3 步就触发压缩
  const keepRecent = 1; // 压缩后保留最近的 1 步在短期记忆中

  // 如果 LTM 未初始化，先给个默认值
  const ltm = long_term_memory || { summary: "", notebook: {}, offset: 0 };
  const offset = ltm.offset || 0;

  // 计算有多少步未压缩
  const uncompressedCount = total_history.length - offset;
  const availableToCompress = uncompressedCount - keepRecent;

  // 如果未压缩的步数没有达到阈值，则直接跳过（空转）
  if (availableToCompress < threshold) {
    return {};
  }

  console.log(`[Memory] Triggering compression. Uncompressed: ${uncompressedCount}, Target to compress: ${availableToCompress}`);

  // 提取待压缩片段
  const endIndex = offset + availableToCompress;
  const toCompress = total_history.slice(offset, endIndex);

  // 1. Mock LLM 压缩过程
  // 在真实环境中，这里会把 `toCompress` 的动作记录发给 LLM，让 LLM 总结成一句话
  const compressedActions = toCompress.map(item => item.action?.type).join(", ");
  const newSummaryChunk = `User requested "${request}". Executed steps: ${compressedActions}.`;
  
  // 将新摘要追加到现有的 LTM 中
  const newSummary = ltm.summary 
    ? `${ltm.summary}\n${newSummaryChunk}`
    : newSummaryChunk;

  console.log(`[Memory] New Summary Generated: ${newSummary}`);

  // 2. 返回更新后的长期记忆
  return {
    long_term_memory: {
      ...ltm,
      summary: newSummary,
      offset: endIndex // 游标向前推进，相当于截断了前段历史
    }
  };
};
