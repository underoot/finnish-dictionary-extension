import { readFileSync, writeFileSync } from 'node:fs';
import { cwd } from 'node:process';
import { join } from 'node:path';

const DICT = join(cwd(), 'scripts', 'FinnWordNet-2.0', 'dict');
const OUT = join(cwd(), 'lib', 'fwn-data.mts');

const POS = ['noun', 'verb', 'adj', 'adv'];

function* readLines(path) {
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('  ')) continue;
    yield line;
  }
}

function parseData(path) {
  const map = new Map();
  for (const line of readLines(path)) {
    const pipeIdx = line.indexOf('|');
    if (pipeIdx === -1) continue;
    const offset = line.slice(0, 8);
    const gloss = line.slice(pipeIdx + 1).trim();
    map.set(offset, gloss);
  }
  return map;
}

function parseIndex(path) {
  const entries = [];
  for (const line of readLines(path)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    let i = 0;
    const lemma = parts[i++];
    const pos = parts[i++];
    const synsetCnt = parseInt(parts[i++], 10);
    const pCnt = parseInt(parts[i++], 10);
    if (Number.isNaN(synsetCnt) || Number.isNaN(pCnt)) continue;
    i += pCnt;
    i++; // sense_cnt
    i++; // tagsense_cnt
    const offsets = [];
    for (let j = 0; j < synsetCnt; j++) {
      const off = parts[i++];
      if (off) offsets.push(off);
    }
    entries.push({ lemma, pos, offsets });
  }
  return entries;
}

const dictionary = Object.create(null);

for (const pos of POS) {
  const data = parseData(join(DICT, `data.${pos}`));
  const index = parseIndex(join(DICT, `index.${pos}`));
  for (const { lemma, offsets } of index) {
    const word = lemma.replace(/_/g, ' ');
    const defs = offsets.map((o) => data.get(o)).filter(Boolean);
    if (defs.length === 0) continue;
    if (!dictionary[word]) dictionary[word] = [];
    dictionary[word].push(...defs);
  }
}

writeFileSync(OUT, `export default ${JSON.stringify(dictionary)};\n`);

const wordCount = Object.keys(dictionary).length;
console.log(`wrote ${OUT} (${wordCount} lemmas)`);
