import type { SyntheticEvent } from 'react';

type Props = {
  rect: DOMRect;
  onDefinition: () => void;
};

export default function WordPanel({ rect, onDefinition }: Props) {
  const top = Math.max(8, rect.top - 44);
  const left = Math.min(window.innerWidth - 60, rect.left);
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  return (
    <div
      className="fi-panel"
      style={{ top, left }}
      onMouseDown={stop}
      onMouseUp={stop}
      onClick={stop}
      onPointerDown={stop}
      onPointerUp={stop}
      onTouchStart={stop}
      onTouchEnd={stop}
    >
      <button
        title="Definitions"
        aria-label="Definitions"
        onClick={(e) => {
          e.stopPropagation();
          onDefinition();
        }}
      >
        {/* dictionary / book icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4h7a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
          <path d="M22 4h-7a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h8z" />
        </svg>
      </button>
    </div>
  );
}
