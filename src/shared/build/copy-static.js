import fs from 'node:fs';
import path from 'node:path';
/**
 * Creates an rsbuild plugin that copies static files after build
 * @param options Configuration options for copying static files
 * @returns Rsbuild plugin object
 */
export const createCopyStaticPlugin = (options) => ({
    name: options.pluginName || 'copy-static',
    setup(api) {
        api.onAfterBuild(async () => {
            const { srcDir, destDir, faviconPath } = options;
            // Remove symlink left by dev mode before copying
            const stat = await fs.promises.lstat(destDir).catch(() => null);
            if (stat?.isSymbolicLink()) {
                await fs.promises.unlink(destDir);
            }
            await fs.promises.mkdir(destDir, { recursive: true });
            // Copy directory contents recursively
            await fs.promises.cp(srcDir, destDir, { recursive: true });
            console.log(`Copied build artifacts from ${srcDir} to ${destDir}`);
            // Copy favicon if specified
            if (faviconPath) {
                const faviconDest = path.join(destDir, 'favicon.ico');
                await fs.promises.copyFile(faviconPath, faviconDest);
                console.log(`Copied favicon from ${faviconPath} to ${faviconDest}`);
            }
        });
    },
});
/**
 * Helper function to create a copy static plugin for playground builds
 * @param srcDir Source directory (usually dist directory)
 * @param destDir Destination directory
 * @param pluginName Optional plugin name
 * @param faviconSrc Optional favicon source path
 * @returns Rsbuild plugin
 */
export const createPlaygroundCopyPlugin = (srcDir, destDir, pluginName, faviconSrc) => {
    return createCopyStaticPlugin({
        srcDir,
        destDir,
        faviconPath: faviconSrc,
        pluginName,
    });
};
