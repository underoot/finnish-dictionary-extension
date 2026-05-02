import type { Analysis } from 'voikko';

export type WordDefinition = {
  analysis: Analysis;
  definitions: string[];
};

export type WordDefinitionList = {
  word: string;
  definitions: WordDefinition[];
};

export type DictionaryEntry = {
  baseform: string;
  wordClass?: string;
  definitions: string[];
  addedAt: number;
  sourceUrl?: string;
  sourceTitle?: string;
};

export type DictionaryMap = Record<string, DictionaryEntry>;

export type Message =
  | { type: 'TOGGLE_ACTIVE'; tabId?: number }
  | { type: 'GET_ACTIVE'; tabId: number }
  | { type: 'ANALYZE'; word: string }
  | { type: 'BASEFORMS'; words: string[] }
  | { type: 'GET_DICTIONARY' }
  | { type: 'ADD_ENTRY'; entry: DictionaryEntry }
  | { type: 'REMOVE_ENTRY'; baseform: string }
  | { type: 'OPEN_DICTIONARY_PAGE' };

export type MessageResult =
  | { ok: true; data?: any }
  | { ok: false; error: string };
