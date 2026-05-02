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
});
