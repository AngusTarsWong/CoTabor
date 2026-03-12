export function assert(value: unknown, message?: string): asserts value {
  if (!value) {
    throw new Error(message || 'Assertion failed');
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export * from './keepalive';
