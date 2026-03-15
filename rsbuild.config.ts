import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import path from 'path';

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginNodePolyfill()
  ],
  source: {
    entry: {
      sidepanel: './src/sidepanel/index.tsx',
      background: './src/background/index.ts',
    },
    define: {
      // Inject VITE_ variables individually to avoid breaking process.env assignment
      ...Object.keys(process.env).reduce((defs, key) => {
        if (key.startsWith('VITE_') || key === 'NODE_ENV') {
          defs[`process.env.${key}`] = JSON.stringify(process.env[key]);
        }
        return defs;
      }, {} as Record<string, string>),
    },
    alias: {
      'node:async_hooks': path.resolve(__dirname, './src/shared/polyfills/async_hooks.ts'),
      'async_hooks': path.resolve(__dirname, './src/shared/polyfills/async_hooks.ts'),
    },
  },
  output: {
    target: 'web',
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
