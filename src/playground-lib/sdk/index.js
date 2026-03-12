import { PLAYGROUND_SERVER_PORT } from '@/shared/constants';
import { LocalExecutionAdapter } from '../adapters/local-execution';
import { RemoteExecutionAdapter } from '../adapters/remote-execution';
export class PlaygroundSDK {
    adapter;
    constructor(config) {
        this.adapter = this.createAdapter(config.type, config.serverUrl, config.agent, config.agentFactory);
    }
    createAdapter(type, serverUrl, agent, agentFactory) {
        switch (type) {
            case 'local-execution':
                if (!agent && !agentFactory) {
                    throw new Error('Agent or agentFactory is required for local execution');
                }
                return new LocalExecutionAdapter(agent, agentFactory);
            case 'remote-execution': {
                // Use provided serverUrl first, then fallback to localhost if current page origin is file:// or default
                const finalServerUrl = serverUrl ||
                    (typeof window !== 'undefined' &&
                        window.location.protocol.includes('http')
                        ? window.location.origin
                        : `http://localhost:${PLAYGROUND_SERVER_PORT}`);
                return new RemoteExecutionAdapter(finalServerUrl);
            }
            default:
                throw new Error(`Unsupported execution type: ${type}`);
        }
    }
    async executeAction(actionType, value, options) {
        const result = await this.adapter.executeAction(actionType, value, options);
        return result;
    }
    async getActionSpace(context) {
        // Both adapters now accept context parameter
        // Local will prioritize internal agent, Remote will use server + fallback
        return this.adapter.getActionSpace(context);
    }
    validateStructuredParams(value, action) {
        return this.adapter.validateParams(value, action);
    }
    formatErrorMessage(error) {
        return this.adapter.formatErrorMessage(error);
    }
    createDisplayContent(value, needsStructuredParams, action) {
        return this.adapter.createDisplayContent(value, needsStructuredParams, action);
    }
    // Get adapter ID (works for both remote and local execution)
    get id() {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.id;
        }
        if (this.adapter instanceof LocalExecutionAdapter) {
            return this.adapter.id;
        }
        return undefined;
    }
    // Server communication methods (for remote execution)
    async checkStatus() {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.checkStatus();
        }
        return true; // For local execution, always return true
    }
    async overrideConfig(aiConfig) {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.overrideConfig(aiConfig);
        }
        // For local execution, this is a no-op
    }
    // Get task progress (for remote execution)
    async getTaskProgress(requestId) {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.getTaskProgress(requestId);
        }
        // For local execution, progress is handled via onDumpUpdate callback
        return {};
    }
    // Cancel task (for remote execution)
    async cancelTask(requestId) {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.cancelTask(requestId);
        }
        return { error: 'Cancel task not supported in local execution mode' };
    }
    // Dump update callback management
    onDumpUpdate(callback) {
        if (this.adapter instanceof LocalExecutionAdapter) {
            this.adapter.onDumpUpdate(callback);
        }
        else if (this.adapter instanceof RemoteExecutionAdapter) {
            this.adapter.onDumpUpdate(callback);
        }
    }
    // Progress update callback management
    onProgressUpdate(callback) {
        if (this.adapter instanceof LocalExecutionAdapter) {
            this.adapter.setProgressCallback(callback);
        }
        // RemoteExecutionAdapter uses polling mechanism via onDumpUpdate, no separate progress callback needed
    }
    // Cancel execution - supports both remote and local
    async cancelExecution(requestId) {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            const result = await this.adapter.cancelTask(requestId);
            // Return dump and reportHTML if available from cancellation
            if (result.success) {
                return {
                    dump: result.dump || null,
                    reportHTML: result.reportHTML || null,
                };
            }
        }
        else if (this.adapter instanceof LocalExecutionAdapter) {
            // Invoke adapter cancellation to destroy the agent and block further actions
            const result = await this.adapter.cancelTask(requestId);
            if (result.success) {
                return {
                    dump: result.dump || null,
                    reportHTML: result.reportHTML || null,
                };
            }
        }
        return null;
    }
    // Get current execution data (dump and report)
    async getCurrentExecutionData() {
        if (this.adapter instanceof LocalExecutionAdapter &&
            this.adapter.getCurrentExecutionData) {
            return await this.adapter.getCurrentExecutionData();
        }
        // For remote execution or if method not available, return empty data
        return { dump: null, reportHTML: null };
    }
    // Screenshot method for remote execution
    async getScreenshot() {
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.getScreenshot();
        }
        return null; // For local execution, not supported yet
    }
    // Get interface information (type and description)
    async getInterfaceInfo() {
        if (this.adapter instanceof LocalExecutionAdapter) {
            return this.adapter.getInterfaceInfo();
        }
        if (this.adapter instanceof RemoteExecutionAdapter) {
            return this.adapter.getInterfaceInfo();
        }
        return null;
    }
    // Get service mode based on adapter type
    getServiceMode() {
        if (this.adapter instanceof LocalExecutionAdapter) {
            return 'In-Browser-Extension';
        }
        return 'Server';
    }
}
