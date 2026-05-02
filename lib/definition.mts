import voikko, {type Analysis} from 'voikko';
import nlp from 'compromise';

import fwnPlugin, { FwnPlugin } from './plugin.mts';

nlp.extend(fwnPlugin);

const voikkoFi = voikko().init('fi');

type WordDefinition = {
  analysis: Analysis;
  definitions: string[];
};

type WordDefinitionList = {
  word: string;
  definitions: WordDefinition[];
};

export function getDefinitionListAsync(word: string): Promise<WordDefinitionList | null> {
  const analysis = voikkoFi.analyze(word);
  const metForms = new Set<string>();
  if (analysis.length === 0) {
    return Promise.resolve(null);
  }

  const result: WordDefinitionList = {
    word,
    definitions: [],
  };

  for (const a of analysis) {
    if (!a.BASEFORM) continue;
    const key = `${a.BASEFORM}:${a.CLASS}`;
    if (metForms.has(key)) continue;
    metForms.add(key);

    const meaning: WordDefinition = {
      analysis: a,
      definitions: [],
    };

    if (a.CLASS === 'etunimi') {
      result.definitions.push(meaning);
      continue;
    }

    const lookup = nlp<FwnPlugin>(a.BASEFORM).fwnDefinitions();
    const definitions = Object.values(lookup).flat();
    if (definitions.length > 0) {
      meaning.definitions = definitions;
      result.definitions.push(meaning);
    }

    for (const part of compoundParts(a.WORDBASES)) {
      const partKey = `${part}:part`;
      if (metForms.has(partKey)) continue;
      metForms.add(partKey);
      const partLookup = nlp<FwnPlugin>(part).fwnDefinitions();
      const partDefs = Object.values(partLookup).flat();
      if (partDefs.length === 0) continue;
      result.definitions.push({
        analysis: { ...a, BASEFORM: part },
        definitions: partDefs,
      });
    }
  }

  return Promise.resolve(result);
}

function compoundParts(wordbases: string | undefined): string[] {
  if (!wordbases) return [];
  const parts: string[] = [];
  const re = /\+([^+()]+)(?:\(([^)]+)\))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(wordbases))) {
    const surface = m[1];
    const base = m[2] ?? surface;
    if (base.length <= 1 || base === '-') continue;
    parts.push(base.toLowerCase());
  }
  return parts.length > 1 ? parts : [];
}
