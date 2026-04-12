
import { Skill, SkillMetadata } from "./types";
import { echoSkill } from "./library/echo";
import { feishuOperatorSkill } from "./bundled/feishu-operator";
import { browserNavigateSkill, browserClickIndexSkill, browserTypeIndexSkill, browserScrollSkill, browserNewTabSkill, browserSwitchTabSkill, browserCloseTabSkill } from "./bundled/system-browser";
import { UserSkillLoader } from "./user/loader";

// Dual-source Registry: Manages Bundled Skills and User/MCP Skills
export class SkillRegistry {
  private bundledSkills: Map<string, Skill> = new Map();
  private userSkills: Map<string, Skill> = new Map();
  private isLoading = false;

  constructor() {
    console.log("[SkillRegistry] Constructor called.");
    this.registerBuiltinSkills();
  }
  private registerBuiltinSkills() {
    this.bundledSkills.set(echoSkill.name, echoSkill);
    this.bundledSkills.set(feishuOperatorSkill.name, feishuOperatorSkill);
    this.bundledSkills.set(browserNavigateSkill.name, browserNavigateSkill);
    this.bundledSkills.set(browserNewTabSkill.name, browserNewTabSkill);
    this.bundledSkills.set(browserSwitchTabSkill.name, browserSwitchTabSkill);
    this.bundledSkills.set(browserCloseTabSkill.name, browserCloseTabSkill);
    this.bundledSkills.set(browserClickIndexSkill.name, browserClickIndexSkill);
    this.bundledSkills.set(browserTypeIndexSkill.name, browserTypeIndexSkill);
    this.bundledSkills.set(browserScrollSkill.name, browserScrollSkill);
  }

  /** Initial load — call once at extension startup. */
  async loadAll() {
    console.log("[SkillRegistry] Loading skills...");
    await this.reloadUserSkills();
    console.log(`[SkillRegistry] Loaded ${this.bundledSkills.size} bundled skills, ${this.userSkills.size} user/MCP skills.`);
  }

  /**
   * (Re-)load all MCP user skills from the current chrome.storage.local config.
   * Safe to call multiple times — drops the previous user skill set first.
   * Called automatically by loadAll() and by the Options page after config changes.
   */
  async reloadUserSkills(): Promise<{ loaded: number; failed: number }> {
    if (this.isLoading) {
      console.warn("[SkillRegistry] reloadUserSkills already in progress, skipping.");
      return { loaded: 0, failed: 0 };
    }
    this.isLoading = true;
    this.userSkills.clear();

    let loaded = 0;
    let failed = 0;
    try {
      const skills = await UserSkillLoader.loadSkills();
      for (const skill of skills) {
        this.userSkills.set(skill.name, skill);
        loaded++;
      }
    } catch (e) {
      console.error("[SkillRegistry] Failed to load user skills:", e);
      failed++;
    } finally {
      this.isLoading = false;
    }
    console.log(`[SkillRegistry] User skills reloaded: ${loaded} loaded, ${failed} failed.`);
    return { loaded, failed };
  }

  getAvailableSkills(context: { url?: string } = {}): Skill[] {
    const available: Skill[] = [];
    const allSkills = this.getAllSkills();

    for (const skill of allSkills) {
      if (this.checkGating(skill, context)) {
        available.push(skill);
      }
    }

    return available;
  }

  getAllSkills(): Skill[] {
    const allSkills: Skill[] = [];
    for (const skill of this.bundledSkills.values()) {
        allSkills.push(skill);
    }
    for (const skill of this.userSkills.values()) {
        allSkills.push(skill);
    }
    return allSkills;
  }

  private checkGating(skill: Skill, context: { url?: string }): boolean {
    if (!skill.gating) return true; // Default to available if no gating

    if (skill.gating.url_pattern) {
      if (!context.url) return false; // Strict gating: must have URL to match pattern
      const regex = new RegExp(skill.gating.url_pattern);
      if (!regex.test(context.url)) {
        return false;
      }
    }

    if (skill.gating.check) {
      return skill.gating.check(context);
    }

    return true;
  }

  getMetadataList(): SkillMetadata[] {
    return this.getAvailableSkills(); // Backward compatibility
  }

  async execute(name: string, params: any, context?: any) {
    const skill = this.bundledSkills.get(name) || this.userSkills.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found.`);
    }
    console.log(`[SkillRegistry] Executing skill: ${name}`);
    return await skill.execute(params, context);
  }

  async getManual(name: string) {
    const skill = this.bundledSkills.get(name) || this.userSkills.get(name);
    if (!skill) {
      throw new Error(`Skill '${name}' not found.`);
    }
    return await skill.getManual();
  }

  getAuditConfig(name: string) {
    const skill = this.bundledSkills.get(name) || this.userSkills.get(name);
    return skill?.auditConfig;
  }
}

export const skillRegistry = new SkillRegistry();
