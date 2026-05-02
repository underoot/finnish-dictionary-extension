import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Finnish Dictionary',
  version: '0.1.0',
  description: 'Toggle dictionary mode on Finnish (lang="fi") pages.',
  action: {
    default_title: 'Toggle Finnish Dictionary',
  },
  background: {
    scripts: ['src/background.ts'],
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/main.tsx'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'contextMenus', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  web_accessible_resources: [
    {
      resources: ['src/dictionary/index.html', 'assets/*'],
      matches: ['<all_urls>'],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
});
