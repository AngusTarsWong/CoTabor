import { defineConfig } from 'wxt';
import path from 'path';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@': path.resolve(__dirname, '../../src'),
  },
  manifest: {
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'debugger'],
    action: {},
    name: 'CoTabor',
    description: 'CoTabor Extension',
  }
});
