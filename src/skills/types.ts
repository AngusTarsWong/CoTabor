
export type SkillRole = 'query' | 'action';

// Gating conditions for context-aware skill filtering
export interface SkillGating {
  url_pattern?: string;
  check?: (context: any) => boolean;
}

export interface SkillAuditConfig {
  strategy: 'rule_based' | 'llm_semantic';
  validator?: (result: any) => boolean;
}

export interface SkillMetadata {
  name: string;
  description: string;
  role: SkillRole;
  params: Record<string, string>; // simple description of params
  type: 'local' | 'mcp';
  gating?: SkillGating;
  auditConfig?: SkillAuditConfig;
}

export interface Skill extends SkillMetadata {
  execute: (params: any, context?: any) => Promise<any>;
  getManual: () => Promise<string>; // Returns the content of SKILL.md
}
