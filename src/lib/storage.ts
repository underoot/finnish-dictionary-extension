import type { DictionaryEntry, DictionaryMap } from '../types';

const ENTRY_PREFIX = 'entry:';
const ACTIVE_KEY = 'activeTabs';

function entryKey(baseform: string): string {
  return ENTRY_PREFIX + baseform;
}

export async function getDictionary(): Promise<DictionaryMap> {
  const all = await chrome.storage.local.get(null);
  const out: DictionaryMap = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(ENTRY_PREFIX) && v && typeof v === 'object') {
      out[k.slice(ENTRY_PREFIX.length)] = v as DictionaryEntry;
    }
  }
  return out;
}

export async function addEntry(entry: DictionaryEntry): Promise<void> {
  await chrome.storage.local.set({ [entryKey(entry.baseform)]: entry });
}

export async function removeEntry(baseform: string): Promise<void> {
  await chrome.storage.local.remove(entryKey(baseform));
}

export async function updateQuizStatus(baseform: string, status: import('../types').QuizStatus): Promise<void> {
  const key = entryKey(baseform);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as import('../types').DictionaryEntry | undefined;
  if (!entry) return;
  await chrome.storage.local.set({ [key]: { ...entry, quizStatus: status } });
}

export function onDictionaryChanged(cb: (dict: DictionaryMap) => void): () => void {
  let scheduled = false;
  const fire = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(async () => {
      scheduled = false;
      cb(await getDictionary());
    });
  };
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    for (const k of Object.keys(changes)) {
      if (k.startsWith(ENTRY_PREFIX)) {
        fire();
        return;
      }
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
