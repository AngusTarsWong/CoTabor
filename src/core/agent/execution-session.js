import { TaskRunner } from '@/core/task-runner';
/**
 * Thin wrapper around {@link TaskRunner} that represents a single linear execution run.
 */
export class ExecutionSession {
    runner;
    constructor(name, contextProvider, options) {
        this.runner = new TaskRunner(name, contextProvider, options);
    }
    async append(tasks, options) {
        await this.runner.append(tasks, options);
    }
    async appendAndRun(tasks, options) {
        return this.runner.appendAndFlush(tasks, options);
    }
    async run(options) {
        return this.runner.flush(options);
    }
    isInErrorState() {
        return this.runner.isInErrorState();
    }
    latestErrorTask() {
        return this.runner.latestErrorTask();
    }
    appendErrorPlan(errorMsg) {
        return this.runner.appendErrorPlan(errorMsg);
    }
    getRunner() {
        return this.runner;
    }
}
