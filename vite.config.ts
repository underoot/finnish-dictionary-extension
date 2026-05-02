import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

function backgroundScriptsManifest(): Plugin {
  return {
    name: 'background-scripts-manifest',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const path = resolve(process.cwd(), 'dist/manifest.json');
      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch {
        return;
      }
      const json = JSON.parse(raw);
      let changed = false;
      if (json.background?.service_worker) {
        json.background = {
          scripts: [json.background.service_worker],
          type: json.background.type ?? 'module',
        };
        changed = true;
      }
      if (Array.isArray(json.web_accessible_resources)) {
        for (const r of json.web_accessible_resources) {
          if (r && 'use_dynamic_url' in r) {
            delete r.use_dynamic_url;
            changed = true;
          }
        }
      }
      if (changed) writeFileSync(path, JSON.stringify(json, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), backgroundScriptsManifest()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        dictionary: 'src/dictionary/index.html',
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
