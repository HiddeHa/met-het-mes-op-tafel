import type { CSSProperties } from 'react';
import { formatMoney } from '../game/engine';
import type { GameState } from '../game/types';

export function PotDisplay({ state }: { state: GameState }) {
  const event = state.lastEvent;
  const isShootout = state.phase === 'shootout' && Boolean(state.shootout);
  const shootoutBonus = state.shootout?.bonus ?? 0;
  const revealPot = state.reveal
    ? state.reveal.potAwarded + state.reveal.carried
    : state.pot;
  const amount = isShootout
    ? shootoutBonus + state.pot
    : state.phase === 'reveal'
      ? revealPot
      : state.pot;
  const showCoins =
    event &&
    (event.kind === 'bet' ||
      event.kind === 'potwin' ||
      event.kind === 'bonus');
  const showCarry =
    !isShootout &&
    state.carryIn > 0 &&
    (state.phase === 'answering' || state.phase === 'betting');

  return (
    <section
      className={`pot ${isShootout ? 'pot--shootout' : ''}`}
      aria-label={isShootout ? 'Shootout-pot' : 'De pot'}
      aria-live="polite"
    >
      <div className="pot-top">
        <span className="pot-label">
          {isShootout ? 'Shootout-pot' : 'De pot'}
        </span>
        {showCarry && (
          <span className="pot-carry">
            + {formatMoney(state.carryIn)} doorgeschoven
          </span>
        )}
        {isShootout && state.pot > 0 && (
          <span className="pot-carry">+ {formatMoney(state.pot)} uit de ronde</span>
        )}
        {state.phase === 'betting' && (
          <span className="pot-live">
            <span className="pulse-dot" aria-hidden /> Inzetronde
          </span>
        )}
        {state.phase === 'answerReveal' && (
          <span className="pot-carry">Antwoorden op tafel</span>
        )}
        {isShootout && (
          <span className="pot-live">
            <span className="pulse-dot" aria-hidden /> Finale
          </span>
        )}
        {state.phase === 'reveal' && state.reveal && (
          <span className="pot-carry">
            {state.reveal.potWinners.length > 0 ? 'geclaimd' : 'doorgeschoven'}
          </span>
        )}
      </div>

      <div className="pot-amount" key={amount}>
        {formatMoney(amount)}
      </div>

      <div className="pot-meta">
        <span>
          {isShootout
            ? state.pot > 0
              ? `Bonus ${formatMoney(shootoutBonus)} + pot ${formatMoney(state.pot)}`
              : 'Eerste bel, eerste antwoord — fout is eruit'
            : state.phase === 'answering' || state.phase === 'answerReveal'
              ? `Verplichte inzet ${formatMoney(state.roundStake)} p.p.`
              : state.phase === 'betting'
                ? `Hoogste inzet ${formatMoney(state.highestBet)}`
                : `Beste briefje ${state.reveal?.bestCount ?? 0} van 4`}
        </span>
      </div>

      <div className="pot-chips" aria-hidden>
        {Array.from({ length: 7 }).map((_, index) => (
          <span key={index} className={`chip chip--${index % 3}`} />
        ))}
      </div>

      {showCoins && (
        <div className="coin-flight" key={event.id} aria-hidden>
          {Array.from({ length: 6 }).map((_, index) => (
            <span
              key={index}
              className="flying-coin"
              style={{ '--i': index } as CSSProperties}
            >
              €
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
