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
  const cancelLemmasRef = useRef<(() => void) | null>(null);

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
      cancelLemmasRef.current?.();
      cancelLemmasRef.current = scheduleLemmatize(baseSet);
    } else if (decoratedRef.current) {
      cancelLemmasRef.current?.();
      cancelLemmasRef.current = null;
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
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
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
const PROCESSED = '__fiDictProcessed';
const DECORATED_CLASS = 'fi-dict-decorated';
const BATCH_SIZE = 40;

const surfaceSpans = new Map<string, HTMLSpanElement[]>();
const surfaceBaseforms = new Map<string, string[]>();

function decorate(onWordClick: (e: MouseEvent) => void) {
  surfaceSpans.clear();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if ((parent as any)[PROCESSED]) return NodeFilter.FILTER_REJECT;
      if (parent.closest('#__fi-dict-host')) return NodeFilter.FILTER_REJECT;
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      return FINNISH_WORD.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) targets.push(n as Text);

  for (const textNode of targets) {
    const parent = textNode.parentElement;
    if (!parent) continue;
    const text = textNode.nodeValue!;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    FINNISH_WORD.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FINNISH_WORD.exec(text))) {
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
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    parent.replaceChild(frag, textNode);
    (parent as any)[PROCESSED] = true;
  }

  injectStyles();
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
    delete (parent as any)[PROCESSED];
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
      text-decoration: underline wavy #c0007a;
      text-decoration-thickness: 2px;
      text-underline-offset: 3px;
    }
  `;
  document.head.appendChild(style);
}
