export const DEFAULT_MODEL_CONFIG = {
    provider: 'openai',
    modelName: 'gpt-4o',
    temperature: 0,
};
export const PLANNER_MODEL_CONFIG = {
    ...DEFAULT_MODEL_CONFIG,
    modelName: 'gpt-4o', // Planner 通常需要更强的推理能力
};
export const EXECUTOR_MODEL_CONFIG = {
    ...DEFAULT_MODEL_CONFIG,
    modelName: 'gpt-3.5-turbo', // Executor 可以用更快、更便宜的模型
};
