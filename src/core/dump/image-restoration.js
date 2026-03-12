/**
 * Recursively restore image references in parsed data.
 * Replaces { $screenshot: "id" } with lazy { get base64() {...}, capturedAt } objects.
 * The resolver is only called when .base64 is first accessed.
 */
export function restoreImageReferences(data, resolveImage) {
    if (typeof data === 'string') {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map((item) => restoreImageReferences(item, resolveImage));
    }
    if (typeof data === 'object' && data !== null) {
        if ('$screenshot' in data) {
            const screenshotData = data;
            const id = screenshotData.$screenshot;
            const capturedAt = typeof screenshotData.capturedAt === 'number'
                ? screenshotData.capturedAt
                : undefined;
            if (typeof id === 'string') {
                // If id looks like a path or base64 data, use it directly (no lazy needed)
                if (id.startsWith('data:image/') ||
                    id.startsWith('./') ||
                    id.startsWith('/')) {
                    return { base64: id, capturedAt };
                }
                // Create lazy getter — .base64 is only resolved when first accessed
                let resolved = null;
                const lazy = Object.defineProperties({}, {
                    base64: {
                        get() {
                            if (resolved === null) {
                                resolved = resolveImage(id);
                            }
                            return resolved;
                        },
                        enumerable: true,
                    },
                    capturedAt: { value: capturedAt, enumerable: true },
                });
                return lazy;
            }
            // Invalid $screenshot value, return empty
            console.warn('Invalid $screenshot value type:', typeof id);
            return { base64: '' };
        }
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = restoreImageReferences(value, resolveImage);
        }
        return result;
    }
    return data;
}
