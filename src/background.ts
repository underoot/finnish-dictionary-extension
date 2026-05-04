import voikko from 'voikko';
import { getDefinitionListAsync } from '../lib/definition.mts';
import type { Message, MessageResult } from './types';
import { setTabActive, getActiveTabs } from './lib/storage';
import { bergamotService } from './lib/bergamot';
import { TRANSLATIONS } from './lib/i18n';

const voikkoFi = voikko().init('fi');
const baseformCache = new Map<string, string[]>();

function baseformsOf(word: string): string[] {
  const key = word.toLowerCase();
  const cached = baseformCache.get(key);
  if (cached) return cached;
  const out = new Set<string>();
  for (const a of voikkoFi.analyze(word)) {
    if (a.BASEFORM) out.add(a.BASEFORM.toLowerCase());
  }
  const arr = [...out];
  baseformCache.set(key, arr);
  return arr;
}

async function getLocalizedMsgs() {
  const result = await chrome.storage.local.get('pref:uiLocale');
  const locale = result['pref:uiLocale'] as string | undefined ?? '';
  return TRANSLATIONS[locale] ?? TRANSLATIONS['en'];
}

const CONTEXT_MENU_ID = 'open-personal-dictionary';

chrome.runtime.onInstalled.addListener(async () => {
  const msgs = await getLocalizedMsgs();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: msgs.personalDictionary,
    contexts: ['action'],
  });
  chrome.action.setTitle({ title: msgs.actionTitle });
});

chrome.storage.onChanged.addListener(async (changes) => {
  if (!changes['pref:uiLocale']) return;
  const msgs = await getLocalizedMsgs();
  try {
    await chrome.contextMenus.update(CONTEXT_MENU_ID, { title: msgs.personalDictionary });
  } catch {
    chrome.contextMenus.create({ id: CONTEXT_MENU_ID, title: msgs.personalDictionary, contexts: ['action'] });
  }
  chrome.action.setTitle({ title: msgs.actionTitle });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    openDictionaryPage();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const active = await getActiveTabs();
  const next = !active[tab.id];
  await setTabActive(tab.id, next);
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ACTIVE', active: next });
  } catch {
    // Content script not present — inject it. It will read the active state from storage.
    try {
      const contentUrl = chrome.runtime.getURL('assets/content.js');
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (url: string) => { await import(/* @vite-ignore */ url as any); },
        args: [contentUrl],
      });
    } catch {
      // Restricted page (chrome://, file://, etc.) — roll back.
      await setTabActive(tab.id, false);
      return;
    }
  }
  chrome.action.setBadgeText({ tabId: tab.id, text: next ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#c0007a' });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    // Full page navigation — content script is gone, reset state.
    await setTabActive(tabId, false);
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  if (changeInfo.status !== 'complete') return;
  const active = await getActiveTabs();
  if (active[tabId]) {
    chrome.action.setBadgeText({ tabId, text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#c0007a' });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setTabActive(tabId, false);
});

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch((e) =>
    sendResponse({ ok: false, error: String(e?.message ?? e) }),
  );
  return true; // async
});

async function handleMessage(msg: Message, sender: chrome.runtime.MessageSender): Promise<MessageResult> {
  switch (msg.type) {
    case 'GET_ACTIVE': {
      const tabId = msg.tabId ?? sender.tab?.id;
      if (tabId == null) return { ok: true, data: false };
      const map = await getActiveTabs();
      return { ok: true, data: !!map[tabId] };
    }
    case 'ANALYZE': {
      const result = await getDefinitionListAsync(msg.word);
      return { ok: true, data: result };
    }
    case 'BASEFORMS': {
      const out: Record<string, string[]> = {};
      for (const w of msg.words) out[w] = baseformsOf(w);
      return { ok: true, data: out };
    }
    case 'TRANSLATE': {
      console.log('[Bergamot] translate request:', msg.from, '→', msg.to, JSON.stringify(msg.text.slice(0, 40)));
      try {
        const translation = await bergamotService.translate(msg.text, msg.from, msg.to);
        return { ok: true, data: translation };
      } catch (e) {
        console.error('[Bergamot] translate failed:', e);
        throw e;
      }
    }
    case 'OPEN_DICTIONARY_PAGE': {
      openDictionaryPage();
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown message: ${(msg as any).type}` };
  }
}

function openDictionaryPage() {
  const url = chrome.runtime.getURL('src/dictionary/index.html');
  chrome.tabs.create({ url });
}
