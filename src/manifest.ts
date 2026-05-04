import { defineManifest } from '@crxjs/vite-plugin';
import { version } from '../package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Finnish Dictionary',
  version,
  description: 'Toggle dictionary mode on Finnish pages.',
  action: {
    default_title: 'Toggle Finnish Dictionary',
    default_icon: {
      '16': 'src/icons/icon-16.png',
      '32': 'src/icons/icon-32.png',
      '48': 'src/icons/icon-48.png',
      '128': 'src/icons/icon-128.png',
    },
  },
  icons: {
    '16': 'src/icons/icon-16.png',
    '32': 'src/icons/icon-32.png',
    '48': 'src/icons/icon-48.png',
    '128': 'src/icons/icon-128.png',
  },
  background: {
    service_worker: 'src/background.ts',
    scripts: ['src/background.ts'],
    type: 'module',
  } as any,
  options_ui: {
    page: 'src/settings/index.html',
    open_in_tab: true,
  },
  permissions: ['storage', 'contextMenus', 'activeTab', 'scripting'],
  web_accessible_resources: [
    {
      resources: [
        'src/dictionary/index.html',
        'src/settings/index.html',
        'src/licenses/index.html',
        'assets/*',
        'translator-worker.js',
        'bergamot-translator-worker.js',
        'bergamot-translator-worker.wasm',
      ],
      matches: ['<all_urls>'],
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  browser_specific_settings: {
    gecko: {
      id: 'finnish.dictionary@underoot.dev',
      strict_min_version: '128.0',
    },
  },
} as any);
