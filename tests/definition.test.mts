import { describe, it, expect } from 'vitest';
import { getDefinitionListAsync } from '../lib/definition.mts';

describe('getDefinitionListAsync', () => {
  it('returns definitions for a common noun', async () => {
    const result = await getDefinitionListAsync('kissa');
    expect(result).toMatchSnapshot();
  });

  it('returns definitions for an inflected form', async () => {
    const result = await getDefinitionListAsync('kissalla');
    expect(result).toMatchSnapshot();
  });

  it('returns definitions for a verb', async () => {
    const result = await getDefinitionListAsync('juosta');
    expect(result).toMatchSnapshot();
  });

  it('handles a first name (etunimi)', async () => {
    const result = await getDefinitionListAsync('Matti');
    expect(result).toMatchSnapshot();
  });

  it('returns null for an unanalyzable token', async () => {
    const result = await getDefinitionListAsync('xyzqqq');
    expect(result).toBeNull();
  });

  it('returns definitions for vetää', async () => {
    const result = await getDefinitionListAsync('vetää');
    expect(result).toMatchSnapshot();
  });

  it('returns component definitions for a compound word', async () => {
    const result = await getDefinitionListAsync('vappukulkueen');
    expect(result).not.toBeNull();
    const baseforms = result!.definitions.map((d) => d.analysis.BASEFORM);
    expect(baseforms).toContain('vappu');
    expect(baseforms).toContain('kulkue');
    for (const d of result!.definitions) {
      if (d.analysis.BASEFORM === 'vappu' || d.analysis.BASEFORM === 'kulkue') {
        expect(d.definitions.length).toBeGreaterThan(0);
      }
    }
  });

  it('does not duplicate components when the whole word matches the only baseform', async () => {
    const result = await getDefinitionListAsync('kissa');
    expect(result).not.toBeNull();
    const baseforms = result!.definitions.map((d) => d.analysis.BASEFORM);
    expect(new Set(baseforms).size).toBe(baseforms.length);
  });
});
