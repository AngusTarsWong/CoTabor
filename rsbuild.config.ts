import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const PUBLIC_ENV_KEYS = [
  'NODE_ENV',
  'VITE_DEBUG_MODE',
  'VITE_MEDIA_CAPTURE_ON_FAIL',
  'VITE_MULTI_AGENT_SCHEDULER',
  'VITE_LARK_APP_ID',
  'VITE_NOTION_CLIENT_ID',
] as const;

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginNodePolyfill()
  ],
  source: {
    entry: {
      sidepanel: './src/sidepanel/index.tsx',
      options: './src/options/index.tsx',
      background: './src/background/index.ts',
    },
    define: {
      // Only inject a strict public allowlist. Secrets must stay in runtime storage or Node env.
      ...PUBLIC_ENV_KEYS.reduce((defs, key) => {
        const value = process.env[key];
        if (value !== undefined) {
          defs[`process.env.${key}`] = JSON.stringify(value);
        }
        return defs;
      }, {} as Record<string, string>),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0"),
    },
    alias: {
      'node:async_hooks': path.resolve(__dirname, './src/shared/polyfills/async_hooks.ts'),
      'async_hooks': path.resolve(__dirname, './src/shared/polyfills/async_hooks.ts'),
    },
  },
  output: {
    target: 'web',
    sourceMap: {
      js: false,
      css: false,
    },
    distPath: {
      root: 'dist',
      js: '',
      html: '',
    },
    filename: {
      js: '[name].js',
    },
    filenameHash: false,
    // Set publicPath to empty string for relative paths in generated HTML
    assetPrefix: './',
  },
  html: {
    title: 'CoTabor',
    template: './public/index.html',
  },
  tools: {
    rspack: {
      resolve: {
        fallback: {
          'async_hooks': false,
        }
      },
      output: {
        // Ensure no chunk splitting for simplicity if possible, or just let it be.
      }
    }
  }
});
