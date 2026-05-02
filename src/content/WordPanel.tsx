type Props = {
  rect: DOMRect;
  onDefinition: () => void;
};

export default function WordPanel({ rect, onDefinition }: Props) {
  const top = Math.max(8, rect.top - 44);
  const left = Math.min(window.innerWidth - 60, rect.left);
  return (
    <div className="fi-panel" style={{ top, left }} onMouseDown={(e) => e.stopPropagation()}>
      <button title="Definitions" onClick={onDefinition} aria-label="Definitions">
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
