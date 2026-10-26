interface HeaderActionsProps {
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
}

export function HeaderActions({
  soundOn,
  onToggleSound,
  onOpenRules,
}: HeaderActionsProps) {
  return (
    <div className="header-actions">
      <button
        type="button"
        className="icon-btn"
        onClick={onToggleSound}
        aria-pressed={soundOn}
        title={soundOn ? 'Geluid uitzetten' : 'Geluid aanzetten'}
      >
        <span aria-hidden>{soundOn ? '🔊' : '🔇'}</span>
        <span className="icon-btn-label">{soundOn ? 'Geluid aan' : 'Geluid uit'}</span>
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--text"
        onClick={onOpenRules}
      >
        Spelregels
      </button>
    </div>
  );
}
