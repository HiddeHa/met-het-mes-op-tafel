import type { LogEntry } from '../game/types';

export function LogTicker({ entries }: { entries: LogEntry[] }) {
  const visible = entries.slice(-2);
  if (!visible.length) return null;

  return (
    <footer className="ticker" aria-live="polite">
      <span className="ticker-label">Tafelpraat</span>
      <div className="ticker-lines">
        {visible.map((entry) => (
          <p key={entry.id} className={`ticker-line ticker-line--${entry.tone}`}>
            {entry.text}
          </p>
        ))}
      </div>
    </footer>
  );
}
