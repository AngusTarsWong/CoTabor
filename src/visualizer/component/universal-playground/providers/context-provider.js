/**
 * Base context provider implementation
 */
export class BaseContextProvider {
    cachedContext;
    async refreshContext() {
        this.cachedContext = undefined;
        return await this.getUIContext();
    }
}
/**
 * Agent-based context provider for local execution modes
 */
export class AgentContextProvider extends BaseContextProvider {
    getAgent;
    options;
    constructor(getAgent, options) {
        super();
        this.getAgent = getAgent;
        this.options = options;
    }
    async getUIContext() {
        if (this.cachedContext) {
            return this.cachedContext;
        }
        const agent = this.getAgent();
        if (!agent?.getUIContext) {
            throw new Error('Agent does not support getUIContext');
        }
        const context = await agent.getUIContext();
        this.cachedContext = context;
        return context;
    }
}
/**
 * Static context provider for pre-determined UI contexts
 */
export class StaticContextProvider extends BaseContextProvider {
    context;
    constructor(context) {
        super();
        this.context = context;
    }
    async getUIContext() {
        return this.context;
    }
    async refreshContext() {
        // Static context doesn't change
        return this.context;
    }
}
/**
 * No-op context provider for cases where context preview is disabled
 */
export class NoOpContextProvider {
    async getUIContext() {
        throw new Error('Context preview is disabled');
    }
    async refreshContext() {
        throw new Error('Context preview is disabled');
    }
}
