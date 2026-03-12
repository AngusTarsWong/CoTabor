import { Agent as PageAgent } from '@/core/agent';
import type StaticPage from './static-page';

export class StaticPageAgent extends PageAgent {
  constructor(page: StaticPage) {
    // Disable report generation in browser environment to avoid Node.js fs module errors
    super(page, { generateReport: false });
    this.dryMode = true;
  }
}
