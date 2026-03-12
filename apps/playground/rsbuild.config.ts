import path from 'node:path';
import {
  commonIgnoreWarnings,
  createPlaygroundCopyPlugin,
} from '../../src/shared';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginWorkspaceDev } from 'rsbuild-plugin-workspace-dev';
import { version as playgroundVersion } from '../../package.json';

export default defineConfig({
  tools: {
    rspack: {
      ignoreWarnings: commonIgnoreWarnings,
    },
  },
  plugins: [
    pluginReact(),
    pluginLess(),
    pluginNodePolyfill(),
    pluginSvgr(),
    createPlaygroundCopyPlugin(
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../../src/playground-lib/static'),
      'copy-playground-static',
      path.join(__dirname, 'src', 'favicon.ico'),
    ),
    createPlaygroundCopyPlugin(
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../../src/ios/static'),
      'copy-ios-playground-static',
      path.join(__dirname, 'src', 'favicon.ico'),
    ),
    createPlaygroundCopyPlugin(
      path.join(__dirname, 'dist'),
      path.join(__dirname, '../../src/harmony/static'),
      'copy-harmony-playground-static',
      path.join(__dirname, 'src', 'favicon.ico'),
    ),
    pluginTypeCheck(),
    pluginWorkspaceDev({
      projects: {
        '@/report': {
          skip: true,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      // Polyfill Node.js modules for browser environment
      async_hooks: path.join(
        __dirname,
        '../../src/shared/polyfills/async-hooks.ts',
      ),
      'node:async_hooks': path.join(
        __dirname,
        '../../src/shared/polyfills/async-hooks.ts',
      ),
      // These are Node.js-only modules used for proxy support
      // They're only imported dynamically in Node.js environment
      undici: false,
      'fetch-socks': false,
    },
  },
  html: {
    title: 'Cotabor Playground',
    favicon: './src/favicon.ico',
  },
  source: {
    entry: {
      index: './src/index.tsx',
    },
    define: {
      __APP_VERSION__: JSON.stringify(playgroundVersion),
      __SERVER_URL__: JSON.stringify(process.env.__SERVER_URL__ || ''),
    },
  },
  output: {
    distPath: {
      root: 'dist',
    },
    sourceMap: true,
    externals: ['sharp'],
  },
});
