import { Agent as PageAgent } from '@/core/agent';
export class StaticPageAgent extends PageAgent {
    constructor(page) {
        // Disable report generation in browser environment to avoid Node.js fs module errors
        super(page, { generateReport: false });
        this.dryMode = true;
    }
}
