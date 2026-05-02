import { useEffect, useRef, useState } from 'react';
import WordPanel from './WordPanel';
import BottomSheet from './BottomSheet';
import { sendMessage } from '../lib/messages';
import { getDictionary, onDictionaryChanged } from '../lib/storage';
import type { DictionaryMap, WordDefinitionList } from '../types';

type Selection = {
  word: string;
  rect: DOMRect;
};

export default function App() {
  const [active, setActive] = useState(false);
  const [dict, setDict] = useState<DictionaryMap>({});
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sheet, setSheet] = useState<WordDefinitionList | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const decoratedRef = useRef(false);
  const cancelLemmasRef = useRef<Array<() => void>>([]);
  const captionsObserverRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getDictionary().then(setDict);
    return onDictionaryChanged(setDict);
  }, []);

  useEffect(() => {
    const listener = (msg: any) => {
      if (msg?.type === 'TOGGLE_ACTIVE') setActive(!!msg.active);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    const onWordClick = (e: MouseEvent) => {
      const span = e.currentTarget as HTMLElement;
      e.preventDefault();
      e.stopPropagation();
      setSelection({ word: span.dataset.fiWord!, rect: span.getBoundingClientRect() });
    };
    if (active) {
      if (!decoratedRef.current) {
        decorate(onWordClick);
        decoratedRef.current = true;
      }
      const baseSet = new Set(Object.keys(dict).map((b) => b.toLowerCase()));
      applyKnownFromCache(baseSet);
      cancelLemmasRef.current.forEach((c) => c());
      cancelLemmasRef.current = [scheduleLemmatize(baseSet)];

      captionsObserverRef.current?.();
      captionsObserverRef.current = watchCaptions(onWordClick, () => {
        applyKnownFromCache(baseSet);
        cancelLemmasRef.current.push(scheduleLemmatize(baseSet));
      });
    } else if (decoratedRef.current) {
      cancelLemmasRef.current.forEach((c) => c());
      cancelLemmasRef.current = [];
      captionsObserverRef.current?.();
      captionsObserverRef.current = null;
      undecorate();
      decoratedRef.current = false;
      setSelection(null);
      setSheet(null);
    }
  }, [active, dict]);

  useEffect(() => {
    if (!active) return;
    const onOutside = (e: MouseEvent) => {
      const path = e.composedPath() as Element[];
      for (const el of path) {
        if (el instanceof Element) {
          if (el.id === '__fi-dict-host') return;
          const data = (el as HTMLElement).dataset;
          if (data && data.fiWord) return;
        }
      }
      setSelection(null);
    };
    const onScroll = () => setSelection(null);
    document.addEventListener('click', onOutside);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener('click', onOutside);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [active]);

  const openDefinitions = async () => {
    if (!selection) return;
    setSheetLoading(true);
    try {
      const res = await sendMessage({ type: 'ANALYZE', word: selection.word });
      if (res.ok) setSheet(res.data as WordDefinitionList);
    } finally {
      setSheetLoading(false);
    }
  };

  return (
    <div className="fi-no-intercept">
      {active && selection && (
        <WordPanel rect={selection.rect} onDefinition={openDefinitions} />
      )}
      {(sheet || sheetLoading) && (
        <BottomSheet
          data={sheet}
          loading={sheetLoading}
          dict={dict}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE']);
const FINNISH_WORD = /[A-Za-zÅÄÖåäöÉéÜü]+(?:[-'][A-Za-zÅÄÖåäöÉéÜü]+)*/g;
const DECORATED_CLASS = 'fi-dict-decorated';
const BATCH_SIZE = 40;

const surfaceSpans = new Map<string, HTMLSpanElement[]>();
const surfaceBaseforms = new Map<string, string[]>();

function decorate(onWordClick: (e: MouseEvent) => void) {
  surfaceSpans.clear();
  decorateRoot(document.body, onWordClick);
  injectStyles();
}

function decorateRoot(root: Node, onWordClick: (e: MouseEvent) => void) {
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    if (root.nodeType === Node.TEXT_NODE) {
      decorateTextNode(root as Text, onWordClick);
    }
    return;
  }
  const walker = document.createTreeWalker(root as Element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains(DECORATED_CLASS)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('#__fi-dict-host')) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      return FINNISH_WORD.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);
  for (const textNode of targets) decorateTextNode(textNode, onWordClick);
}

function decorateTextNode(textNode: Text, onWordClick: (e: MouseEvent) => void) {
  const parent = textNode.parentElement;
  if (!parent) return;
  if (parent.classList.contains(DECORATED_CLASS)) return;
  if (SKIP_TAGS.has(parent.tagName)) return;
  if (parent.closest('#__fi-dict-host')) return;
  const text = textNode.nodeValue;
  if (!text) return;
  const frag = document.createDocumentFragment();
  let lastIndex = 0;
  FINNISH_WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = FINNISH_WORD.exec(text))) {
    matched = true;
    const word = m[0];
    const start = m.index;
    if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    const span = document.createElement('span');
    span.dataset.fiWord = word;
    span.textContent = word;
    span.classList.add('fi-clickable', DECORATED_CLASS);
    span.addEventListener('click', onWordClick);
    const key = word.toLowerCase();
    const list = surfaceSpans.get(key);
    if (list) list.push(span);
    else surfaceSpans.set(key, [span]);
    frag.appendChild(span);
    lastIndex = start + word.length;
  }
  if (!matched) return;
  if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
  parent.replaceChild(frag, textNode);
}

const CAPTIONS_SELECTOR = '[aria-label="Tekstitykset"]';

function watchCaptions(onWordClick: (e: MouseEvent) => void, onNewWords: () => void): () => void {
  let innerObserver: MutationObserver | null = null;
  let watched: Element | null = null;
  let outer: MutationObserver | null = null;
  let scheduled = false;

  const observeInner = () => {
    if (!innerObserver || !watched) return;
    innerObserver.observe(watched, { childList: true, subtree: true, characterData: true });
  };

  const processAdditions = (nodes: Node[]) => {
    if (!nodes.length) return;
    innerObserver?.disconnect();
    for (const node of nodes) {
      if (!watched || !watched.contains(node)) continue;
      decorateRoot(node, onWordClick);
    }
    observeInner();
    onNewWords();
  };

  const attach = (root: Element) => {
    if (watched === root) return;
    innerObserver?.disconnect();
    watched = root;
    decorateRoot(root, onWordClick);
    onNewWords();
    innerObserver = new MutationObserver((mutations) => {
      const additions: Node[] = [];
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => additions.push(node));
        } else if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
          additions.push(m.target);
        }
      }
      if (!additions.length || scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        processAdditions(additions);
      });
    });
    observeInner();
    outer?.disconnect();
    outer = null;
  };

  const armOuter = () => {
    if (outer) return;
    outer = new MutationObserver(() => {
      const found = document.querySelector(CAPTIONS_SELECTOR);
      if (found) attach(found);
    });
    outer.observe(document.body, { childList: true, subtree: true });
  };

  const existing = document.querySelector(CAPTIONS_SELECTOR);
  if (existing) attach(existing);
  else armOuter();

  return () => {
    outer?.disconnect();
    outer = null;
    innerObserver?.disconnect();
    innerObserver = null;
    watched = null;
  };
}

function applyKnownFromCache(baseSet: Set<string>) {
  for (const [surface, spans] of surfaceSpans) {
    const known = isKnown(surface, baseSet);
    if (known === null) continue;
    for (const s of spans) s.classList.toggle('fi-known', known);
  }
}

function isKnown(surface: string, baseSet: Set<string>): boolean | null {
  if (baseSet.has(surface)) return true;
  const cached = surfaceBaseforms.get(surface);
  if (!cached) return null;
  return cached.some((b) => baseSet.has(b));
}

function scheduleLemmatize(baseSet: Set<string>): () => void {
  const pending = [...surfaceSpans.keys()].filter((s) => !surfaceBaseforms.has(s));
  let cancelled = false;
  let cursor = 0;

  const tick = async (deadline?: IdleDeadline) => {
    if (cancelled) return;
    while (cursor < pending.length) {
      const batch = pending.slice(cursor, cursor + BATCH_SIZE);
      cursor += batch.length;
      const res = await sendMessage({ type: 'BASEFORMS', words: batch });
      if (cancelled) return;
      if (!res.ok) continue;
      const data = res.data as Record<string, string[]>;
      for (const [surface, bases] of Object.entries(data)) {
        const lower = bases.map((b) => b.toLowerCase());
        surfaceBaseforms.set(surface, lower);
        if (isKnown(surface, baseSet)) {
          for (const span of surfaceSpans.get(surface) ?? []) span.classList.add('fi-known');
        }
      }
      if (deadline && deadline.timeRemaining() <= 0) {
        schedule(tick);
        return;
      }
    }
  };

  schedule(tick);
  return () => {
    cancelled = true;
  };
}

function schedule(cb: (deadline?: IdleDeadline) => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(cb, { timeout: 500 });
  } else {
    setTimeout(() => cb(), 0);
  }
}

function undecorate() {
  const spans = document.querySelectorAll<HTMLSpanElement>(`.${DECORATED_CLASS}`);
  spans.forEach((span) => {
    const parent = span.parentElement;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent ?? ''), span);
    parent.normalize();
  });
  surfaceSpans.clear();
}

function injectStyles() {
  if (document.getElementById('__fi-dict-page-style')) return;
  const style = document.createElement('style');
  style.id = '__fi-dict-page-style';
  style.textContent = `
    .${DECORATED_CLASS}.fi-clickable { cursor: pointer; }
    .${DECORATED_CLASS}.fi-known {
      text-decoration: underline wavy #003580;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
  `;
  document.head.appendChild(style);
}
