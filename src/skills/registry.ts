
import { Skill, SkillMetadata } from "./types";
import { echoSkill } from "./library/echo";

// Mock registry for now, will implement file scanning later
class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    // Manually register built-in skills for now
    this.registerBuiltinSkills();
  }

  private registerBuiltinSkills() {
    // Register the echo skill
    this.skills.set(echoSkill.name, echoSkill);
  }

  // In a real app, this would scan directories
  async loadAll() {
    console.log("[SkillRegistry] Loading skills...");
    // Mock loading
    console.log(`[SkillRegistry] Loaded ${this.skills.size} skills.`);
  }

  getMetadataList(): SkillMetadata[] {
    return Array.from(this.skills.values()).map(s => ({
      name: s.name,
      description: s.description,
      role: s.role,
      params: s.params,
      type: s.type
    }));
  }

  async execute(name: string, params: any) {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found.`);
    }
    console.log(`[SkillRegistry] Executing skill: ${name}`);
    return await skill.execute(params);
  }

  async getManual(name: string) {
    const skill = this.skills.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found.`);
    }
    return await skill.getManual();
  }
}

export const skillRegistry = new SkillRegistry();
