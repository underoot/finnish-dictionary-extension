import { useCallback, useEffect, useRef, useState } from 'react';
import { getDictionary, onDictionaryChanged, removeEntry, updateQuizStatus } from '../lib/storage';
import { translationService } from '../lib/translation';
import { useTranslationProgress } from '../lib/useTranslationProgress';
import { useLocale } from '../lib/useLocale';
import type { Messages } from '../lib/i18n';
import type { DictionaryMap, DictionaryEntry, QuizStatus } from '../types';

const COLLAPSE_THRESHOLD = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

type Filter = 'all' | 'today' | 'week' | 'month';
type QuizFilter = 'all' | 'untouched' | 'remembered' | 'forgotten';

const FILTERS: Filter[] = ['all', 'today', 'week', 'month'];
const QUIZ_FILTERS: QuizFilter[] = ['all', 'untouched', 'remembered', 'forgotten'];

function filterLabel(id: Filter, msgs: Messages): string {
  switch (id) {
    case 'all': return msgs.filterAll;
    case 'today': return msgs.filterToday;
    case 'week': return msgs.filterWeek;
    case 'month': return msgs.filterMonth;
  }
}

function quizFilterLabel(id: QuizFilter, msgs: Messages): string {
  switch (id) {
    case 'all': return msgs.quizFilterAll;
    case 'untouched': return msgs.quizFilterUntouched;
    case 'remembered': return msgs.quizFilterRemembered;
    case 'forgotten': return msgs.quizFilterForgotten;
  }
}

function filterCutoff(filter: Filter): number {
  const now = Date.now();
  switch (filter) {
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case 'week':
      return now - 7 * DAY_MS;
    case 'month':
      return now - 30 * DAY_MS;
    default:
      return 0;
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Group = { key: string; label: string; url: string | null; entries: DictionaryEntry[] };

function groupByUrl(entries: DictionaryEntry[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of entries) {
    const key = e.sourceUrl ?? '';
    if (!map.has(key)) {
      const label = e.sourceUrl
        ? e.sourceTitle || hostnameOf(e.sourceUrl)
        : 'Unknown source';
      map.set(key, { key, label, url: e.sourceUrl ?? null, entries: [] });
    }
    map.get(key)!.entries.push(e);
  }
  return [...map.values()].sort((a, b) => {
    const aMax = Math.max(...a.entries.map((e) => e.addedAt));
    const bMax = Math.max(...b.entries.map((e) => e.addedAt));
    return bMax - aMax;
  });
}

export default function Dictionary() {
  const { msgs, isRtl } = useLocale();
  useEffect(() => { document.title = msgs.personalDictionary; }, [msgs]);
  const [dict, setDict] = useState<DictionaryMap>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [quizFilter, setQuizFilter] = useState<QuizFilter>('all');
  const [grouped, setGrouped] = useState(false);
  const [showTranslations, setShowTranslations] = useState(false);
  const [translations, setTranslations] = useState<Map<string, string>>(new Map());
  const [quizOpen, setQuizOpen] = useState(false);
  const downloadProgress = useTranslationProgress();

  const allEntries = Object.values(dict).sort((a, b) => b.addedAt - a.addedAt);
  const cutoff = filterCutoff(filter);
  const dateFiltered = cutoff === 0 ? allEntries : allEntries.filter((e) => e.addedAt >= cutoff);
  const entries = dateFiltered.filter((e) => {
    if (quizFilter === 'all') return true;
    if (quizFilter === 'untouched') return !e.quizStatus;
    return e.quizStatus === quizFilter;
  });
  const groups = grouped ? groupByUrl(entries) : null;

  const allEntriesRef = useRef(allEntries);
  allEntriesRef.current = allEntries;

  const runTranslations = useCallback(() => {
    const toTranslate = allEntriesRef.current;
    if (!toTranslate.length || !translationService.available) return;

    const texts = new Set<string>();
    for (const e of toTranslate) {
      texts.add(e.baseform);
      e.definitions.forEach((d) => texts.add(d));
    }

    const textsArr = [...texts];
    Promise.all(textsArr.map((t) => translationService.translate(t))).then((results) => {
      const map = new Map<string, string>();
      textsArr.forEach((t, i) => { if (results[i]) map.set(t, results[i]!); });
      setTranslations(map);
    });
  }, []);

  const showTranslationsRef = useRef(showTranslations);
  showTranslationsRef.current = showTranslations;
  const runTranslationsRef = useRef(runTranslations);
  runTranslationsRef.current = runTranslations;

  useEffect(() => {
    getDictionary().then(setDict);
    return onDictionaryChanged(setDict);
  }, []);

  useEffect(() => {
    chrome.storage.local.get('pref:showTranslations').then((result) => {
      if (result['pref:showTranslations']) {
        setShowTranslations(true);
        runTranslationsRef.current();
      }
    });
  }, []);

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !('pref:targetLang' in changes)) return;
      const newLang = changes['pref:targetLang'].newValue;
      if (newLang) translationService.setTargetLang(newLang);
      setTranslations(new Map());
      setShowTranslations(false);
      chrome.storage.local.set({ 'pref:showTranslations': false });
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const allEntriesKey = allEntries.map((e) => e.baseform).join('\x00');
  useEffect(() => {
    if (showTranslations) runTranslations();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEntriesKey]);

  const toggleTranslations = () => {
    if (showTranslations) {
      setShowTranslations(false);
      setTranslations(new Map());
      chrome.storage.local.set({ 'pref:showTranslations': false });
    } else {
      setShowTranslations(true);
      chrome.storage.local.set({ 'pref:showTranslations': true });
      runTranslations();
    }
  };

  const settingsUrl = chrome.runtime.getURL('src/settings/index.html');

  if (quizOpen) {
    return (
      <div className="wrap" dir={isRtl ? 'rtl' : 'ltr'}>
        <h1>{msgs.personalDictionary}</h1>
        <Quiz entries={entries} translations={translations} msgs={msgs} onClose={() => setQuizOpen(false)} />
      </div>
    );
  }

  const settingsGear = (
    <a href={settingsUrl} target="_blank" rel="noreferrer noopener" className="settings-link" title={msgs.settingsTitle}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </a>
  );

  return (
    <div className="wrap" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="h1-row">
        <h1>{msgs.personalDictionary}</h1>
        {settingsGear}
      </div>

      {allEntries.length === 0 && <p className="empty">{msgs.noEntriesYet}</p>}

      {allEntries.length > 0 && (
        <div className="layout">
          <aside className="sidebar">
            <div className="filter-group">
              <div className="filter-group-label">{msgs.sidebarPeriod}</div>
              {FILTERS.map((id) => (
                <button
                  key={id}
                  className={`filter${filter === id ? ' is-active' : ''}`}
                  onClick={() => setFilter(id)}
                >
                  {filterLabel(id, msgs)}
                </button>
              ))}
            </div>

            <div className="filter-group">
              <div className="filter-group-label">{msgs.sidebarQuizStatus}</div>
              {QUIZ_FILTERS.map((id) => (
                <button
                  key={id}
                  className={`filter filter-quiz filter-quiz-${id}${quizFilter === id ? ' is-active' : ''}`}
                  onClick={() => setQuizFilter(id)}
                >
                  {quizFilterLabel(id, msgs)}
                </button>
              ))}
            </div>

            <div className="filter-group">
              <div className="filter-group-label">{msgs.sidebarView}</div>
              {translationService.available && (
                <label className="group-toggle">
                  <span>{msgs.toggleTranslations}</span>
                  <span className={`toggle-switch${showTranslations ? ' is-on' : ''}`} onClick={toggleTranslations}>
                    <span className="toggle-thumb" />
                  </span>
                </label>
              )}
              <label className="group-toggle">
                <span>{msgs.toggleGroupBySource}</span>
                <span className={`toggle-switch${grouped ? ' is-on' : ''}`} onClick={() => setGrouped((v) => !v)}>
                  <span className="toggle-thumb" />
                </span>
              </label>
            </div>

            {entries.length > 0 && (
              <button className="quiz-start-btn" onClick={() => setQuizOpen(true)}>
                {msgs.startQuiz(entries.length)}
              </button>
            )}
          </aside>

          <div className="entries-area">
            {downloadProgress !== null && (
              <div className="download-progress">
                <div className="download-bar" style={{ width: `${downloadProgress}%` }} />
                <span>{msgs.downloadingModel(downloadProgress)}</span>
              </div>
            )}
            {entries.length === 0 && <p className="empty">{msgs.noEntriesInRange}</p>}
            {groups
              ? groups.map((g) => (
                  <div key={g.key} className="group">
                    <div className="group-header">
                      {g.url ? (
                        <a href={g.url} target="_blank" rel="noreferrer noopener">{g.label}</a>
                      ) : (
                        <span>{g.label}</span>
                      )}
                      <span className="group-count">{g.entries.length}</span>
                    </div>
                    {g.entries.map((e) => <Entry key={e.baseform} entry={e} translations={translations} msgs={msgs} />)}
                  </div>
                ))
              : entries.map((e) => <Entry key={e.baseform} entry={e} translations={translations} msgs={msgs} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function Entry({ entry: e, translations, msgs }: { entry: DictionaryEntry; translations: Map<string, string>; msgs: Messages }) {
  const collapsible = e.definitions.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const visibleDefs = collapsible && !expanded ? e.definitions.slice(0, COLLAPSE_THRESHOLD) : e.definitions;

  return (
    <div className="entry">
      <div className="entry-header">
        <div className="entry-title-row">
          <div>
            <span className="entry-title">{e.baseform}</span>
            {e.wordClass && <span className="entry-class">{e.wordClass}</span>}
            {e.quizStatus && (
              <span className={`quiz-status-badge quiz-status-${e.quizStatus}`}>
                {e.quizStatus === 'remembered' ? '✓' : '✗'}
              </span>
            )}
            {translations.get(e.baseform) && (
              <span className="entry-translation">{translations.get(e.baseform)}</span>
            )}
          </div>
        </div>
        <button
          className="entry-delete"
          onClick={() => removeEntry(e.baseform)}
          aria-label={msgs.deleteBtn}
          title={msgs.deleteBtn}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
          {msgs.deleteBtn}
        </button>
      </div>
      <div className="entry-meta">
        <span title={new Date(e.addedAt).toISOString()}>
          {msgs.addedDate(new Date(e.addedAt).toLocaleDateString())}
        </span>
        {e.sourceUrl && (
          <>
            {' '}{msgs.fromSource}
            <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener">
              {e.sourceTitle || hostnameOf(e.sourceUrl)}
            </a>
          </>
        )}
      </div>
      {e.definitions.length > 0 && (
        <ul className="entry-defs">
          {visibleDefs.map((d, i) => (
            <li key={i}>{translations.get(d) ?? d}</li>
          ))}
        </ul>
      )}
      {collapsible && (
        <button
          className="entry-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <svg
            className={`entry-toggle-chevron${expanded ? ' is-open' : ''}`}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {expanded ? msgs.showLess : msgs.showMore(e.definitions.length - COLLAPSE_THRESHOLD)}
        </button>
      )}
    </div>
  );
}

interface QuizProps {
  entries: DictionaryEntry[];
  translations: Map<string, string>;
  msgs: Messages;
  onClose: () => void;
}

function Quiz({ entries, translations, msgs, onClose }: QuizProps) {
  const [cards] = useState(() => shuffle(entries));
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<Map<string, QuizStatus>>(new Map());

  const isDone = index >= cards.length;
  const current = cards[index];

  const handleAnswer = (status: QuizStatus) => {
    if (flipped) return;
    setFlipped(true);
    updateQuizStatus(current.baseform, status);
    setResults((prev) => new Map(prev).set(current.baseform, status));
  };

  const handleNext = () => {
    setIndex((i) => i + 1);
    setFlipped(false);
  };

  if (isDone) {
    const remembered = [...results.values()].filter((v) => v === 'remembered').length;
    const forgotten = [...results.values()].filter((v) => v === 'forgotten').length;
    return (
      <div className="quiz-done">
        <div className="quiz-done-icon">🎉</div>
        <h2>{msgs.quizComplete}</h2>
        <p className="quiz-done-stats">
          <span className="quiz-done-remembered">{msgs.quizRemembered(remembered)}</span>
          <span className="quiz-done-forgotten">{msgs.quizForgotten(forgotten)}</span>
        </p>
        <button className="quiz-back-btn" onClick={onClose}>{msgs.backToDictionary}</button>
      </div>
    );
  }

  return (
    <div className="quiz">
      <div className="quiz-header">
        <button className="quiz-back-btn" onClick={onClose}>{msgs.quizBack}</button>
        <span className="quiz-progress">{msgs.quizProgress(index + 1, cards.length)}</span>
      </div>
      <div className={`quiz-card${flipped ? ' is-flipped' : ''}`} key={index}>
        <div className="quiz-card-inner">
          <div className="quiz-card-face quiz-card-front">
            <div className="quiz-word">{current.baseform}</div>
            {current.wordClass && <div className="quiz-word-class">{current.wordClass}</div>}
          </div>
          <div className="quiz-card-face quiz-card-back">
            <div className="quiz-word quiz-word--back">{current.baseform}</div>
            {current.wordClass && <div className="quiz-word-class">{current.wordClass}</div>}
            {translations.get(current.baseform) && (
              <div className="quiz-translation">{translations.get(current.baseform)}</div>
            )}
            {current.definitions.length > 0 && (
              <ul className="quiz-defs">
                {current.definitions.slice(0, 3).map((d, i) => (
                  <li key={i}>
                    {d}
                    {translations.get(d) && (
                      <span className="entry-translation">{translations.get(d)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="quiz-actions">
        {flipped ? (
          <button className="quiz-next-btn" onClick={handleNext}>
            {msgs.quizNext}
          </button>
        ) : (
          <>
            <button
              className="quiz-btn quiz-btn-forget"
              onClick={() => handleAnswer('forgotten')}
              aria-label="Don't remember"
              title="Don't remember"
            >
              ✗
            </button>
            <button
              className="quiz-btn quiz-btn-remember"
              onClick={() => handleAnswer('remembered')}
              aria-label="Remember"
              title="Remember"
            >
              ✓
            </button>
          </>
        )}
      </div>
    </div>
  );
}
