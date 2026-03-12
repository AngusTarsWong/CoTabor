import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs', 'debugger'],
    action: {},
    name: 'CoTabor',
    description: 'CoTabor Extension',
  }
});
