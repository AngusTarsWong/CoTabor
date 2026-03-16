
export type SkillRole = 'query' | 'action';

export interface SkillMetadata {
  name: string;
  description: string;
  role: SkillRole;
  params: Record<string, string>; // simple description of params
  type: 'local' | 'mcp';
}

export interface Skill extends SkillMetadata {
  execute: (params: any) => Promise<any>;
  getManual: () => Promise<string>; // Returns the content of SKILL.md
}
