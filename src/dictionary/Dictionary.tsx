import { useEffect, useState } from 'react';
import { getDictionary, onDictionaryChanged, removeEntry } from '../lib/storage';
import type { DictionaryMap } from '../types';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function Dictionary() {
  const [dict, setDict] = useState<DictionaryMap>({});

  useEffect(() => {
    getDictionary().then(setDict);
    return onDictionaryChanged(setDict);
  }, []);

  const entries = Object.values(dict).sort((a, b) => b.addedAt - a.addedAt);

  return (
    <div className="wrap">
      <h1>Personal dictionary</h1>
      {entries.length === 0 && <p className="empty">No entries yet.</p>}
      {entries.map((e) => (
        <div className="entry" key={e.baseform}>
          <div className="entry-header">
            <div>
              <span className="entry-title">{e.baseform}</span>
              {e.wordClass && <span className="entry-class">{e.wordClass}</span>}
            </div>
            <button
              className="entry-delete"
              onClick={() => removeEntry(e.baseform)}
              aria-label="Delete"
              title="Delete"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
          <div className="entry-meta">
            <span title={new Date(e.addedAt).toISOString()}>
              Added {new Date(e.addedAt).toLocaleDateString()}
            </span>
            {e.sourceUrl && (
              <>
                {' · from '}
                <a href={e.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {e.sourceTitle || hostnameOf(e.sourceUrl)}
                </a>
              </>
            )}
          </div>
          {e.definitions.length > 0 && (
            <ul className="entry-defs">
              {e.definitions.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
