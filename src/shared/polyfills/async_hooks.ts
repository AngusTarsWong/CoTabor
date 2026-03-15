
// Robust polyfill for AsyncLocalStorage in browser
// This is a simplified implementation that does NOT support true async context propagation
// because that requires native Node.js support or complex patching (Zone.js).
// However, it prevents crashes by ensuring getStore() never returns null.

export class AsyncLocalStorage<T = any> {
  private store: T | undefined;

  constructor() {
    this.store = undefined;
  }

  getStore(): T | any {
    // Return empty object instead of null/undefined to prevent
    // "Cannot read properties of null" when accessing symbols
    return this.store || {};
  }

  run<R>(store: T, callback: () => R): R {
    const prev = this.store;
    this.store = store;
    try {
      return callback();
    } finally {
      this.store = prev;
    }
  }

  enterWith(store: T): void {
    this.store = store;
  }

  disable(): void {
    this.store = undefined;
  }
}
