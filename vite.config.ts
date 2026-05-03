import { defineConfig, type Plugin } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

const BERGAMOT_WORKER_FILES = [
  'translator-worker.js',
  'bergamot-translator-worker.js',
  'bergamot-translator-worker.wasm',
];

function copyBergamotWorker(): Plugin {
  return {
    name: 'copy-bergamot-worker',
    buildStart() {
      const src = resolve(process.cwd(), 'node_modules/@browsermt/bergamot-translator/worker');
      const dst = resolve(process.cwd(), 'public');
      mkdirSync(dst, { recursive: true });
      for (const file of BERGAMOT_WORKER_FILES) {
        copyFileSync(resolve(src, file), resolve(dst, file));
      }
    },
  };
}

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
      if (json.background) {
        const sw = json.background.service_worker ?? json.background.scripts?.[0];
        if (sw) {
          const next = {
            service_worker: sw,
            scripts: [sw],
            type: json.background.type ?? 'module',
          };
          if (
            json.background.service_worker !== next.service_worker ||
            JSON.stringify(json.background.scripts) !== JSON.stringify(next.scripts) ||
            json.background.type !== next.type
          ) {
            json.background = next;
            changed = true;
          }
        }
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
  plugins: [copyBergamotWorker(), react(), crx({ manifest }), backgroundScriptsManifest()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        dictionary: 'src/dictionary/index.html',
        settings: 'src/settings/index.html',
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
