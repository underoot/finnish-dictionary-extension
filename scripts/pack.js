#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const manifestPath = resolve(dist, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error('dist/manifest.json not found — run "npm run build" first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(manifestPath, 'utf8'));
const out = resolve(root, `extension-${version}.zip`);

execSync(`zip -r "${out}" .`, { cwd: dist, stdio: 'inherit' });
console.log(`Created: ${out}`);
