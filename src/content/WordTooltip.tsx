import { addEntry } from '../lib/storage';
import { useTranslationProgress } from '../lib/useTranslationProgress';
import type { DictionaryMap, WordDefinitionList } from '../types';

type Props = {
  word: string;
  rect: DOMRect;
  data: WordDefinitionList | null;
  loading: boolean;
  dict: DictionaryMap;
  translations: Map<string, string>;
};

const POPUP_WIDTH = 320;
const GAP = 8;

export default function WordTooltip({ word, rect, data, loading, dict, translations }: Props) {
  const downloadProgress = useTranslationProgress();

  const left = Math.min(
    Math.max(GAP, rect.left + rect.width / 2 - POPUP_WIDTH / 2),
    window.innerWidth - POPUP_WIDTH - GAP,
  );
  const spaceAbove = rect.top - GAP;
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const above = spaceAbove > spaceBelow;
  const top = above ? rect.top - GAP : rect.bottom + GAP;
  const maxHeight = Math.max(80, above ? spaceAbove : spaceBelow);

  return (
    <div
      className="fi-tooltip"
      style={{ left, top, maxHeight, transform: above ? 'translateY(-100%)' : 'none' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="fi-tooltip-word">{word}</div>
      {translations.get(word) && (
        <div className="fi-translation">{translations.get(word)}</div>
      )}
      {downloadProgress !== null && (
        <div className="fi-download-progress">
          <div className="fi-download-bar" style={{ width: `${downloadProgress}%` }} />
          <span>Downloading translation model… {downloadProgress}%</span>
        </div>
      )}
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
                {translations.get(baseform) && (
                  <span className="fi-base-translation">{translations.get(baseform)}</span>
                )}
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
                  <li key={j}>
                    {def}
                    {translations.get(def) && (
                      <span className="fi-def-translation">{translations.get(def)}</span>
                    )}
                  </li>
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
