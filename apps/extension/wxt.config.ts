import { defineConfig } from 'wxt';
import path from 'path';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@': path.resolve(__dirname, '../../src'),
  },
  vite: () => ({
    plugins: [
      svgr() as any,
    ],
  }),
  manifest: {
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'debugger'],
    action: {},
    name: 'CoTabor',
    description: 'CoTabor Extension',
  }
});
