import { skillRegistry } from "../../skills/registry";
import { log } from "../../shared/utils/log";
import { Skill } from "../../skills/types";

export async function prepareAvailableSkills(currentUrl?: string): Promise<Skill[]> {
  log.info(`[Memory] Refreshing skills for context URL: ${currentUrl || "N/A"}`);

  try {
    const availableSkills = skillRegistry.getAvailableSkills({ url: currentUrl });
    log.info(`[Memory] Found ${availableSkills.length} available skills.`);
    return availableSkills;
  } catch (error) {
    log.warn("[Memory] Skill registry error (fallback to local skills only):", error);
    return [];
  }
}
