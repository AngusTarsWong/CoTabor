import { Page as BasePage } from './base-page';
export class PuppeteerWebPage extends BasePage {
    constructor(page, opts) {
        super(page, 'puppeteer', opts);
    }
}
