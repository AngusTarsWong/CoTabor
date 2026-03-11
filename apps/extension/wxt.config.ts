import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs'],
    action: {},
    name: 'ChromeClaw',
    description: 'ChromeClaw Extension',
  }
});
