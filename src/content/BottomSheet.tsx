import { useEffect, useRef } from 'react';
import { sendMessage } from '../lib/messages';
import { addEntry } from '../lib/storage';
import type { DictionaryMap, WordDefinitionList } from '../types';

type Props = {
  data: WordDefinitionList | null;
  loading: boolean;
  dict: DictionaryMap;
  onClose: () => void;
};

export default function BottomSheet({ data, loading, dict, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    const onClickOutside = (e: MouseEvent) => {
      if (e.target === dlg) onCloseRef.current();
    };
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('click', onClickOutside);
    return () => {
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('click', onClickOutside);
      if (dlg.open) dlg.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="fi-sheet-dialog"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="fi-sheet"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="fi-sheet-close" onClick={onClose} aria-label="Close">×</button>
        <h2>{data?.word ?? '...'}</h2>
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
                  onClick={async () => {
                    if (!baseform) return;
                    await addEntry({
                      baseform,
                      wordClass,
                      definitions: d.definitions,
                      addedAt: Date.now(),
                      sourceUrl: location.href,
                      sourceTitle: document.title || undefined,
                    });
                    void sendMessage; // keep import warm for tree-shake guard
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
    </dialog>
  );
}
