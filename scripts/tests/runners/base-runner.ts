import fs from "fs";
import path from "path";
import { bootstrapNode, BootstrapOptions } from "../../../src/runner/bootstrap-node";
import type { AgentRuntime } from "../../../src/runner/types";

export interface TestRunnerOptions extends BootstrapOptions {
  testName: string;
}

export interface TraceEvent {
  time: string;
  type: string;
  content: string;
  metadata?: any;
}

/**
 * Base runner for all integration and E2E tests.
 * Manages Node environment setup, Teardown, and JSON trace exporting.
 */
export class BaseTestRunner {
  public runtime: AgentRuntime | null = null;
  public traces: TraceEvent[] = [];
  public testName: string;
  private startTime: number;

  constructor(options: TestRunnerOptions) {
    this.testName = options.testName;
    this.startTime = Date.now();
  }

  /**
   * Boots the underlying Node sandbox (puppeteer + cdp + local indexedDB).
   */
  async setup(options?: BootstrapOptions): Promise<AgentRuntime> {
    this.runtime = await bootstrapNode(options);
    return this.runtime;
  }

  /**
   * Hook for capturing structured log events during test execution.
   */
  logEvent(type: string, content: string, metadata?: any) {
    const time = new Date().toISOString();
    this.traces.push({ time, type, content, metadata });
    
    // Optional: Only log to console if it's a major step to keep output clean
    if (type !== "debug") {
      console.log(`[${this.testName}] [${type}] ${content}`);
    }
  }

  /**
   * Finalize the test, close browsers, and export traces.
   */
  async teardown() {
    if (this.runtime) {
      await this.runtime.cleanup();
    }
    this.exportTrace();
  }

  /**
   * Writes all captured events to a trace file for debugging.
   */
  private exportTrace() {
    const durationMs = Date.now() - this.startTime;
    const report = {
      testName: this.testName,
      durationMs,
      traces: this.traces,
    };
    
    const safeName = this.testName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `trace-${safeName}-${Date.now()}.json`;
    const traceDir = path.join(process.cwd(), ".test-traces");
    const filepath = path.join(traceDir, filename);
    
    try {
      if (!fs.existsSync(traceDir)) {
        fs.mkdirSync(traceDir, { recursive: true });
      }
      fs.writeFileSync(filepath, JSON.stringify(report, null, 2), "utf-8");
      console.log(`\n📄 [Trace exported]: ${filepath}`);
    } catch (e) {
      console.error(`Failed to export trace for ${this.testName}:`, e);
    }
  }
}

/**
 * Utility to run a full test lifecycle automatically.
 */
export async function withTestRunner<T>(
  testName: string,
  fn: (runner: BaseTestRunner, runtime: AgentRuntime) => Promise<T>,
  options?: BootstrapOptions
): Promise<T> {
  const runner = new BaseTestRunner({ testName, ...options });
  const runtime = await runner.setup(options);
  try {
    return await fn(runner, runtime);
  } finally {
    await runner.teardown();
  }
}
