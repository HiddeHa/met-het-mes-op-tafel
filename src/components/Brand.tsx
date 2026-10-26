export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`}>
      <span className="brand-seal" aria-hidden>
        <span>M</span>
      </span>
      <div className="brand-text">
        <p className="brand-kicker">Trivia &amp; inzet</p>
        <h1>
          Met het Mes <em>op Tafel</em>
        </h1>
        {!compact && <p className="brand-sub">Drie spelers. Eén pot. Geen genade.</p>}
      </div>
    </div>
  );
}
