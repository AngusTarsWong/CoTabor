import { Agent as PageAgent } from '@/core/agent';
export class ChromeExtensionProxyPageAgent extends PageAgent {
    // biome-ignore lint/complexity/noUselessConstructor: <explanation>
    constructor(page, opts) {
        super(page, opts);
    }
}
