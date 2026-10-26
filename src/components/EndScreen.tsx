import type { CSSProperties } from 'react';
import { formatMoney, getLeaderboard, leaders } from '../game/engine';
import type { GameState } from '../game/types';
import { Brand } from './Brand';
import { HeaderActions } from './HeaderActions';

export function EndScreen({
  state,
  onPlayAgain,
  onMenu,
  soundOn,
  onToggleSound,
  onOpenRules,
  onlineError,
}: {
  state: GameState;
  onPlayAgain: () => void;
  onMenu: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onlineError?: string | null;
}) {
  const sorted = getLeaderboard(state.players);
  const topPlayers = leaders(state.players);
  const top = topPlayers[0]?.bankroll ?? 0;
  const shared = topPlayers.length > 1;

  return (
    <div className="end">
      <div className="end-glow" aria-hidden />
      <div className="confetti-layer" aria-hidden>
        {Array.from({ length: 26 }).map((_, index) => (
          <span
            key={index}
            className="confetti"
            style={
              {
                left: `${(index * 37) % 100}%`,
                animationDelay: `${(index % 13) * 0.32}s`,
                animationDuration: `${4.2 + (index % 5) * 0.7}s`,
                background:
                  index % 4 === 0
                    ? 'var(--red)'
                    : index % 3 === 0
                      ? 'var(--cream)'
                      : 'var(--gold)',
              } as CSSProperties
            }
          />
        ))}
      </div>

      <header className="end-top">
        <Brand compact />
        <HeaderActions
          soundOn={soundOn}
          onToggleSound={onToggleSound}
          onOpenRules={onOpenRules}
        />
      </header>

      <main className="end-main">
        <p className="eyebrow">De eindstand</p>
        <h2 className="end-title">
          {shared ? 'Gedeelde winst' : `${topPlayers[0]?.name ?? 'Niemand'} wint`}
        </h2>
        <p className="end-sub">
          {shared
            ? 'De stand bleef gelijk — het mes wordt gedeeld.'
            : `Met ${formatMoney(top)} aan de tafel na ${state.config?.rounds ?? 0} rondes.`}
        </p>

        <div className="leaderboard">
          {sorted.map((player, index) => {
            const isWinner = topPlayers.some((winner) => winner.id === player.id);
            return (
              <article
                key={player.id}
                className={`leaderboard-row ${isWinner ? 'is-winner' : ''}`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <span className="leaderboard-rank">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                </span>
                <span className="leaderboard-avatar" aria-hidden>
                  {player.avatar}
                </span>
                <span className="leaderboard-name">
                  <strong>{player.name}</strong>
                  <small>{player.isBot ? 'Bot' : 'Speler'}</small>
                </span>
                <span className="leaderboard-bank">{formatMoney(player.bankroll)}</span>
              </article>
            );
          })}
        </div>

        {onlineError && (
          <p className="field-error end-error" role="alert">
            {onlineError}
          </p>
        )}

        <div className="end-actions">
          <button type="button" className="btn btn--gold btn--lg" onClick={onPlayAgain}>
            Nog een potje
            <span aria-hidden>↻</span>
          </button>
          <button type="button" className="btn btn--ghost btn--lg" onClick={onMenu}>
            Terug naar het menu
          </button>
        </div>
      </main>
    </div>
  );
}
