import type { Dispatch } from 'react';
import {
  QUESTIONS_PER_ROUND,
  formatMoney,
  joinNames,
} from '../game/engine';
import type { GameAction, GameState, Player } from '../game/types';

export function RevealStage({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) {
  const reveal = state.reveal;
  if (!state.questions.length || !reveal) return null;

  const winners = reveal.potWinners
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is Player => Boolean(player));
  const lastRound = state.config ? state.round >= state.config.rounds : false;

  return (
    <section className="stage stage--reveal">
      <header className="stage-head">
        <div>
          <p className="eyebrow">Fase 4 · Onthulling</p>
          <h2>Zo viel het briefje</h2>
        </div>
        <span className="reveal-value">
          Beste briefje {reveal.bestCount} / {QUESTIONS_PER_ROUND}
        </span>
      </header>

      <div className="reveal-questions">
        {state.questions.map((question, index) => (
          <article className="reveal-q" key={question.id}>
            <div className="reveal-q-head">
              <span className="answer-num">{index + 1}</span>
              <span className="qcard-cat">{question.category}</span>
            </div>
            <p className="reveal-q-text">{question.question}</p>
            <p className="reveal-q-correct">
              <span>Goede antwoord</span>
              <strong>{question.answers[0]}</strong>
            </p>

            <div className="reveal-q-players">
              {state.players.map((player) => {
                const result = state.results.find(
                  (entry) => entry.playerId === player.id,
                );
                if (!result) return null;
                const given = result.answers[index] ?? '';
                const correct = result.correct[index] ?? false;
                return (
                  <div
                    key={player.id}
                    className={`reveal-a ${correct ? 'is-good' : 'is-bad'} ${
                      result.folded ? 'is-folded' : ''
                    }`}
                  >
                    <span className="reveal-a-name">
                      <span aria-hidden>{player.avatar}</span>
                      {player.name}
                      {result.folded && <small>· past</small>}
                    </span>
                    <span className={`reveal-a-given ${given ? '' : 'is-empty'}`}>
                      {given || '—'}
                    </span>
                    <span className="reveal-a-mark" aria-hidden>
                      {correct ? '✓' : '✗'}
                    </span>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <div className="reveal-scoreboard">
        {state.players.map((player, playerIndex) => {
          const result = state.results.find(
            (entry) => entry.playerId === player.id,
          );
          if (!result) return null;
          return (
            <div
              key={player.id}
              className={`score-card ${result.folded ? 'is-folded' : ''} ${
                reveal.potWinners.includes(player.id) ? 'is-winner' : ''
              }`}
              style={{ animationDelay: `${playerIndex * 80}ms` }}
            >
              <span className="reveal-avatar" aria-hidden>
                {player.avatar}
              </span>
              <div className="score-id">
                <strong>{player.name}</strong>
                <small>
                  {result.count} van {QUESTIONS_PER_ROUND} goed
                  {result.folded ? ' · gepast' : ''}
                </small>
              </div>
              <div className="score-tags">
                {result.potShare > 0 && (
                  <span className="tag tag--gold">
                    Pot + {formatMoney(result.potShare)}
                  </span>
                )}
                {result.count === 0 && (
                  <span className="tag tag--bad">Geen goed</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`pot-summary ${winners.length ? 'is-won' : 'is-carried'}`}>
        {winners.length > 0 ? (
          <>
            <span className="pot-summary-kicker">De pot is geclaimd</span>
            <strong>
              {joinNames(winners.map((winner) => winner.name))} —{' '}
              {formatMoney(reveal.potAwarded)}
            </strong>
            <span>
              {winners.length > 1
                ? 'Gelijke stand: de pot wordt eerlijk verdeeld.'
                : 'De meeste goede antwoorden claimen de pot.'}
            </span>
          </>
        ) : (
          <>
            <span className="pot-summary-kicker">Geen claim</span>
            <strong>{formatMoney(reveal.carried)} blijft in de pot</strong>
            <span>
              Geen van de overgebleven spelers had een goed antwoord. De pot
              groeit door naar de volgende ronde.
            </span>
          </>
        )}
      </div>

      <div className="reveal-footer">
        <button
          type="button"
          className="btn btn--gold btn--wide"
          onClick={() => dispatch({ type: 'nextRound' })}
        >
          {lastRound ? 'Door naar de shootout' : 'Volgende ronde'}
          <span aria-hidden>→</span>
        </button>
      </div>
    </section>
  );
}
