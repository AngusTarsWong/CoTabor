import { CLIError, runToolsCLI } from '@/shared/cli';
import { BaseMidsceneTools } from '@/shared/mcp';
import { Agent } from '../agent/agent';
/**
 * Skill tools manager that lazily creates Agent from a Device class.
 * Used by runSkillCLI for CLI / Agent Skills scenarios where no agent exists at startup.
 */
class SkillMidsceneTools extends BaseMidsceneTools {
    DeviceClass;
    constructor(DeviceClass) {
        super();
        this.DeviceClass = DeviceClass;
    }
    createTemporaryDevice() {
        return new this.DeviceClass();
    }
    async ensureAgent() {
        if (!this.agent) {
            const device = new this.DeviceClass();
            this.agent = new Agent(device);
        }
        return this.agent;
    }
}
/**
 * Launch a Skill CLI for a custom interface Device class.
 * This enables AI coding assistants (Claude Code, Cline, etc.) to control
 * your custom interface through CLI commands.
 *
 * @example
 * ```typescript
 * #!/usr/bin/env node
 * import { runSkillCLI } from '@/core/skill';
 * import { SampleDevice } from './sample-device';
 *
 * runSkillCLI({
 *   DeviceClass: SampleDevice,
 *   scriptName: 'my-device',
 * });
 * ```
 */
export function runSkillCLI(options) {
    const tools = new SkillMidsceneTools(options.DeviceClass);
    return runToolsCLI(tools, options.scriptName).catch((e) => {
        if (!(e instanceof CLIError))
            console.error(e);
        process.exit(e instanceof CLIError ? e.exitCode : 1);
    });
}
