export function assert(value, message) {
    if (!value) {
        throw new Error(message || 'Assertion failed');
    }
}
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export * from './keepalive';
