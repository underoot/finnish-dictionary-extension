import type { DictionaryEntry, DictionaryMap } from '../types';

const KEY = 'personalDictionary';
const ACTIVE_KEY = 'activeTabs';

export async function getDictionary(): Promise<DictionaryMap> {
  const obj = await chrome.storage.local.get(KEY);
  return (obj[KEY] ?? {}) as DictionaryMap;
}

export async function addEntry(entry: DictionaryEntry): Promise<DictionaryMap> {
  const dict = await getDictionary();
  dict[entry.baseform] = entry;
  await chrome.storage.local.set({ [KEY]: dict });
  return dict;
}

export async function removeEntry(baseform: string): Promise<DictionaryMap> {
  const dict = await getDictionary();
  delete dict[baseform];
  await chrome.storage.local.set({ [KEY]: dict });
  return dict;
}

export function onDictionaryChanged(cb: (dict: DictionaryMap) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[KEY]) {
      cb((changes[KEY].newValue ?? {}) as DictionaryMap);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function getActiveTabs(): Promise<Record<number, boolean>> {
  const obj = await chrome.storage.session.get(ACTIVE_KEY);
  return (obj[ACTIVE_KEY] ?? {}) as Record<number, boolean>;
}

export async function setTabActive(tabId: number, active: boolean): Promise<void> {
  const map = await getActiveTabs();
  if (active) map[tabId] = true;
  else delete map[tabId];
  await chrome.storage.session.set({ [ACTIVE_KEY]: map });
}
