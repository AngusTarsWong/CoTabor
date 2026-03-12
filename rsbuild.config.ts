import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      sidepanel: './src/sidepanel/index.tsx',
      background: './src/background/index.ts',
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
    title: 'ChromeClaw',
    template: './public/index.html',
  },
  tools: {
    rspack: {
      output: {
        // Ensure no chunk splitting for simplicity if possible, or just let it be.
      }
    }
  }
});
