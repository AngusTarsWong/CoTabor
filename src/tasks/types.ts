export interface TaskDefinition {
  /** Unique identifier, used as CLI argument */
  id: string;
  /** Human-readable name shown in UI */
  name: string;
  /** Build the goal string passed to ClawAgent */
  buildGoal(params?: Record<string, string>): string;
  /** Skills this task requires (informational, for UI checks) */
  requiredSkills?: string[];
  /** Default parameter values */
  defaultParams?: Record<string, string>;
}
