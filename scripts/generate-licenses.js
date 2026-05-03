#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const NM = resolve(__dirname, '..', 'node_modules');
const OUT_DIR = resolve(__dirname, '..', 'src', 'licenses');
const OUT = join(OUT_DIR, 'licenses.json');

const LICENSE_NAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.rst',
  'LICENCE', 'LICENCE.md', 'LICENCE.txt',
  'license', 'license.md', 'license.txt',
];

function readLicenseText(dir) {
  for (const name of LICENSE_NAMES) {
    const p = join(dir, name);
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf8').trim(); } catch {}
    }
  }
  return null;
}

function processPackage(pkgDir) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    if (!pkg.name) return null;

    let license = 'Unknown';
    if (typeof pkg.license === 'string') {
      license = pkg.license;
    } else if (pkg.license && typeof pkg.license.type === 'string') {
      license = pkg.license.type;
    } else if (Array.isArray(pkg.licenses) && pkg.licenses[0]) {
      license = pkg.licenses[0].type || 'Unknown';
    }

    let homepage = '';
    if (pkg.homepage) {
      homepage = pkg.homepage;
    } else if (pkg.repository) {
      const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository.url;
      homepage = (url || '').replace(/^git\+/, '').replace(/\.git$/, '');
    }

    let author = '';
    if (typeof pkg.author === 'string') author = pkg.author;
    else if (pkg.author?.name) author = pkg.author.name;

    return {
      name: pkg.name,
      version: pkg.version || '',
      license,
      author,
      homepage,
      licenseText: readLicenseText(pkgDir),
    };
  } catch {
    return null;
  }
}

if (!existsSync(NM)) {
  console.warn('[licenses] node_modules not found, skipping');
  process.exit(0);
}

const packages = [];

for (const entry of readdirSync(NM, { withFileTypes: true })) {
  if (entry.name.startsWith('.')) continue;
  if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

  if (entry.name.startsWith('@')) {
    const scopeDir = join(NM, entry.name);
    try {
      for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
        if (!sub.isDirectory() && !sub.isSymbolicLink()) continue;
        const result = processPackage(join(scopeDir, sub.name));
        if (result) packages.push(result);
      }
    } catch {}
  } else {
    const result = processPackage(join(NM, entry.name));
    if (result) packages.push(result);
  }
}

packages.sort((a, b) => a.name.localeCompare(b.name));

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(packages));
console.log(`✓ Licenses: ${packages.length} packages → src/licenses/licenses.json`);
