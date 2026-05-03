import { useState } from 'react';
import { useLocale } from '../lib/useLocale';
import licensesData from './licenses.json';

type LicenseEntry = {
  name: string;
  version: string;
  license: string;
  author: string;
  homepage: string;
  licenseText: string | null;
};

const entries = licensesData as LicenseEntry[];

export default function Licenses() {
  const { msgs, isRtl } = useLocale();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.license.toLowerCase().includes(q) ||
          e.author.toLowerCase().includes(q),
      )
    : entries;

  const toggle = (name: string) => setExpanded((prev) => (prev === name ? null : name));

  return (
    <div className="wrap" dir={isRtl ? 'rtl' : 'ltr'}>
      <h1>{msgs.openSourceLicenses}</h1>
      <p className="subtitle">{msgs.licensesSubtitle(entries.length)}</p>
      <input
        className="search"
        type="search"
        placeholder={msgs.licensesSearch}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setExpanded(null); }}
      />
      <div className="list">
        {filtered.map((e) => (
          <div key={e.name} className="pkg">
            <button className="pkg-header" onClick={() => toggle(e.name)}>
              <div className="pkg-meta">
                <span className="pkg-name">{e.name}</span>
                <span className="pkg-version">{e.version}</span>
                {e.author && <span className="pkg-author">{e.author}</span>}
              </div>
              <div className="pkg-right">
                <span className="pkg-license">{e.license}</span>
                <svg
                  className={`chevron${expanded === e.name ? ' open' : ''}`}
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>
            {expanded === e.name && (
              <div className="pkg-body">
                {e.homepage && (
                  <a
                    className="pkg-link"
                    href={e.homepage}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {e.homepage}
                  </a>
                )}
                {e.licenseText ? (
                  <pre className="license-text">{e.licenseText}</pre>
                ) : (
                  <p className="no-text">License: {e.license}</p>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="empty">{msgs.licensesEmpty(query)}</p>
        )}
      </div>
    </div>
  );
}
