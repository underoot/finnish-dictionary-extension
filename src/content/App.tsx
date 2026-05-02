import { useCallback, useEffect, useRef, useState } from 'react';
import WordTooltip from './WordTooltip';
import { sendMessage } from '../lib/messages';
import { getDictionary, onDictionaryChanged } from '../lib/storage';
import { translationService } from '../lib/translation';
import type { DictionaryMap, WordDefinitionList } from '../types';

type TooltipState = {
  word: string;
  rect: DOMRect;
  data: WordDefinitionList | null;
  loading: boolean;
};

export default function App() {
  const [active, setActive] = useState(false);
  const [dict, setDict] = useState<DictionaryMap>({});
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const decoratedRef = useRef(false);
  const cancelLemmasRef = useRef<Array<() => void>>([]);
  const captionsObserverRef = useRef<(() => void) | null>(null);
  const tooltipWordRef = useRef<string | null>(null);
  const cmdHeldRef = useRef(false);
  const activeSpanRef = useRef<HTMLElement | null>(null);
  const wordClickedRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Meta') cmdHeldRef.current = true; };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Meta') cmdHeldRef.current = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    getDictionary().then(setDict);
    return onDictionaryChanged(setDict);
  }, []);

  useEffect(() => {
    // Restore active state persisted in session storage across page reloads.
    sendMessage({ type: 'GET_ACTIVE' }).then((res) => {
      if (res.ok) setActive(!!res.data);
    });

    const listener = (msg: any) => {
      if (msg?.type === 'TOGGLE_ACTIVE') setActive(!!msg.active);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!tooltip) { setTranslations(new Map()); return; }
    if (!tooltip.data || !translationService.available) return;

    const texts: string[] = [tooltip.word];
    for (const d of tooltip.data.definitions) {
      if (d.analysis.BASEFORM) texts.push(d.analysis.BASEFORM);
    }
    if (translationService.shouldTranslateDefinitions) {
      for (const d of tooltip.data.definitions) texts.push(...d.definitions);
    }

    let cancelled = false;
    Promise.all(texts.map((t) => translationService.translate(t))).then((results) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      texts.forEach((t, i) => { if (results[i]) map.set(t, results[i]!); });
      setTranslations(map);
    });
    return () => { cancelled = true; };
  }, [tooltip?.word, tooltip?.data]);

  const clearTooltip = useCallback(() => {
    activeSpanRef.current?.classList.remove('fi-active');
    activeSpanRef.current = null;
    tooltipWordRef.current = null;
    setTooltip(null);
  }, []);

  // Close tooltip when clicking outside a word span or the tooltip itself.
  useEffect(() => {
    const onDocClick = () => {
      if (wordClickedRef.current) { wordClickedRef.current = false; return; }
      clearTooltip();
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [clearTooltip]);

  useEffect(() => {
    const showTooltipFor = (word: string, rect: DOMRect) => {
      tooltipWordRef.current = word;
      setTooltip({ word, rect, data: null, loading: true });
      sendMessage({ type: 'ANALYZE', word }).then((res) => {
        if (tooltipWordRef.current !== word) return;
        setTooltip((prev) => {
          if (!prev || prev.word !== word) return prev;
          return { ...prev, data: res.ok ? (res.data as WordDefinitionList) : null, loading: false };
        });
      });
    };

    const onWordClick = (e: MouseEvent) => {
      if (cmdHeldRef.current) return;
      wordClickedRef.current = true;
      const span = e.currentTarget as HTMLElement;

      // Toggle: clicking the active word closes the tooltip.
      if (activeSpanRef.current === span) {
        clearTooltip();
        return;
      }

      activeSpanRef.current?.classList.remove('fi-active');
      span.classList.add('fi-active');
      activeSpanRef.current = span;

      showTooltipFor(span.dataset.fiWord!, span.getBoundingClientRect());
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
      clearTooltip();
    }
  }, [active, dict, clearTooltip]);

  return (
    <div className="fi-no-intercept">
      {active && tooltip && (
        <WordTooltip
          word={tooltip.word}
          rect={tooltip.rect}
          data={tooltip.data}
          loading={tooltip.loading}
          dict={dict}
          translations={translations}
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

function watchCaptions(
  onWordClick: (e: MouseEvent) => void,
  onNewWords: () => void,
): () => void {
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
    .${DECORATED_CLASS}.fi-active {
      background: rgba(0, 53, 128, 0.12);
      border-radius: 2px;
      outline: 1px solid rgba(0, 53, 128, 0.25);
      outline-offset: 1px;
    }
  `;
  document.head.appendChild(style);
}
