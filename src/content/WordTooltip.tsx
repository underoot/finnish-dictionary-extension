import { addEntry } from '../lib/storage';
import type { DictionaryMap, WordDefinitionList } from '../types';

type Props = {
  word: string;
  rect: DOMRect;
  data: WordDefinitionList | null;
  loading: boolean;
  dict: DictionaryMap;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

const POPUP_WIDTH = 320;
const GAP = 8;

export default function WordTooltip({ word, rect, data, loading, dict, onMouseEnter, onMouseLeave }: Props) {
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - POPUP_WIDTH / 2),
    window.innerWidth - POPUP_WIDTH - 8,
  );
  const above = rect.top > 220 || rect.top > window.innerHeight - rect.bottom;
  const top = above ? rect.top - GAP : rect.bottom + GAP;

  return (
    <div
      className="fi-tooltip"
      style={{ left, top, transform: above ? 'translateY(-100%)' : 'none' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="fi-tooltip-word">{word}</div>
      {loading && <p className="fi-loading">Looking up…</p>}
      {!loading && data && data.definitions.length === 0 && (
        <p className="fi-loading">No analysis available.</p>
      )}
      {data?.definitions.map((d, i) => {
        const baseform = d.analysis.BASEFORM ?? '';
        const wordClass = d.analysis.CLASS;
        const inDict = !!dict[baseform];
        return (
          <div key={i} className="fi-base">
            <div className="fi-base-header">
              <div>
                <span className="fi-base-title">{baseform}</span>
                {wordClass && <span className="fi-base-class">{wordClass}</span>}
              </div>
              <button
                className="fi-base-add"
                disabled={inDict || !baseform}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!baseform) return;
                  await addEntry({
                    baseform,
                    wordClass,
                    definitions: d.definitions,
                    addedAt: Date.now(),
                    sourceUrl: location.href,
                    sourceTitle: document.title || undefined,
                    sourceWord: word !== baseform ? word : undefined,
                  });
                }}
              >
                {inDict ? 'Added' : '+ Add'}
              </button>
            </div>
            {d.definitions.length > 0 ? (
              <ul className="fi-defs">
                {d.definitions.map((def, j) => (
                  <li key={j}>{def}</li>
                ))}
              </ul>
            ) : (
              <p className="fi-loading">No definitions in WordNet.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
