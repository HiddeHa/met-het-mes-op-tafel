import { useEffect, useState, type Dispatch } from 'react';
import {
  SHOOTOUT_ANSWER_SECONDS,
  SHOOTOUT_OPEN_SECONDS,
  formatMoney,
} from '../game/engine';
import type { GameAction, GameState } from '../game/types';
import type { OnlineGameMeta } from '../net/protocol';
import { QuestionCard } from './QuestionCard';
import { TimerBar } from './TimerBar';

export function ShootoutStage({
  state,
  dispatch,
  paused = false,
  online,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  paused?: boolean;
  online?: OnlineGameMeta;
}) {
  const shootout = state.shootout;
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    setAnswer('');
  }, [shootout?.question.id, shootout?.buzzedBy]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (paused || !shootout || shootout.stage !== 'open' || event.repeat) return;
      const seat = Number(event.key) - 1;
      if (!Number.isInteger(seat) || seat < 0) return;
      const player = state.players[seat];
      if (!player || player.isBot) return;
      if (online && player.id !== online.youId) return;
      if (shootout.eliminated.includes(player.id)) return;
      event.preventDefault();
      dispatch({ type: 'buzz', playerId: player.id });
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [shootout, state.players, dispatch, paused, online]);

  if (!shootout) return null;

  const buzzedPlayer = shootout.buzzedBy
    ? state.players.find((player) => player.id === shootout.buzzedBy)
    : null;
  const winner = shootout.winnerId
    ? state.players.find((player) => player.id === shootout.winnerId)
    : null;
  const eliminatedPlayers = state.players.filter((player) =>
    shootout.eliminated.includes(player.id),
  );
  const lastWrongPlayer = shootout.lastWrong
    ? state.players.find((player) => player.id === shootout.lastWrong?.playerId)
    : null;
  const canBuzz = shootout.stage === 'open' && !paused;
  const humanAnswering =
    buzzedPlayer &&
    !buzzedPlayer.isBot &&
    (!online || buzzedPlayer.id === online.youId);

  return (
    <section className="stage stage--shootout">
      <div className="shootout-banner">
        <div>
          <p className="eyebrow">De finale</p>
          <h2>Shootout</h2>
        </div>
        <p>
          Eerste bel, eerste antwoord. Goed ={' '}
          <strong>{formatMoney(shootout.bonus)}</strong> en de resterende pot.
          Fout = eruit.
        </p>
      </div>

      <QuestionCard question={shootout.question} compact={shootout.stage === 'answering'} />

      {shootout.stage === 'countdown' ? (
        <div className="countdown" aria-live="assertive">
          <span key={shootout.countdown} className="countdown-number">
            {Math.max(1, shootout.countdown)}
          </span>
          <p>Lees de vraag. Vingers op de bel…</p>
        </div>
      ) : (
        <TimerBar
          value={shootout.timeLeft}
          max={
            shootout.stage === 'open'
              ? SHOOTOUT_OPEN_SECONDS
              : SHOOTOUT_ANSWER_SECONDS
          }
          label={shootout.stage === 'open' ? 'Tijd om te bellen' : 'Antwoordtijd'}
        />
      )}

      {shootout.lastWrong && shootout.stage === 'open' && lastWrongPlayer && (
        <div className="wrong-flash" role="status">
          <strong>Fout!</strong> {lastWrongPlayer.name} antwoordde{' '}
          {shootout.lastWrong.answer ? `"${shootout.lastWrong.answer}"` : 'niets'} en
          ligt eruit. De bel is weer open.
        </div>
      )}

      <div className="buzzers" aria-label="Buzzers">
        {state.players.map((player, index) => {
          if (player.isBot) return null;
          const eliminated = shootout.eliminated.includes(player.id);
          const isBuzzed = shootout.buzzedBy === player.id;
          const mine = !online || player.id === online.youId;
          return (
            <button
              key={player.id}
              type="button"
              className={`buzzer ${eliminated ? 'is-out' : ''} ${isBuzzed ? 'is-buzzed' : ''} ${
                mine ? '' : 'is-remote'
              }`}
              disabled={!canBuzz || eliminated || !mine}
              onClick={() => dispatch({ type: 'buzz', playerId: player.id })}
            >
              <span className="buzzer-key" aria-hidden>
                {index + 1}
              </span>
              <span className="buzzer-avatar" aria-hidden>
                {player.avatar}
              </span>
              <span className="buzzer-name">{player.name}</span>
              <span className="buzzer-action">
                {eliminated
                  ? 'Uitgeschakeld'
                  : isBuzzed
                    ? 'Aan het antwoorden'
                    : !mine
                      ? 'Alleen je eigen bel'
                      : canBuzz
                        ? 'BUZZ'
                        : 'Wacht op de bel'}
              </span>
            </button>
          );
        })}

        {state.players.some((player) => player.isBot) && (
          <div className="bot-buzzers">
            {state.players
              .filter((player) => player.isBot)
              .map((player) => {
                const eliminated = shootout.eliminated.includes(player.id);
                const isBuzzed = shootout.buzzedBy === player.id;
                return (
                  <span
                    key={player.id}
                    className={`bot-buzz-status ${eliminated ? 'is-out' : ''} ${
                      isBuzzed ? 'is-buzzed' : ''
                    }`}
                  >
                    <span aria-hidden>{player.avatar}</span>
                    {player.name}
                    <small>
                      {eliminated
                        ? 'uit'
                        : isBuzzed
                          ? 'antwoordt…'
                          : canBuzz
                            ? 'luistert…'
                            : 'wacht'}
                    </small>
                  </span>
                );
              })}
          </div>
        )}
      </div>

      {shootout.stage === 'answering' && buzzedPlayer && (
        <div className="shootout-answer">
          {humanAnswering ? (
            <form
              className="answer-form"
              onSubmit={(event) => {
                event.preventDefault();
                dispatch({ type: 'shootoutAnswer', text: answer });
              }}
            >
              <label className="answer-label" htmlFor="shootout-input">
                {buzzedPlayer.name}, jouw antwoord telt nu
              </label>
              <div className="answer-row">
                <input
                  id="shootout-input"
                  className="answer-input"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="Snel! Typ je antwoord…"
                  maxLength={140}
                  autoComplete="off"
                  autoFocus
                />
                <button type="submit" className="btn btn--red" disabled={!answer.trim()}>
                  Antwoord
                </button>
              </div>
              <p className="fineprint">
                Je hebt {shootout.timeLeft} seconden. Geen antwoord = eruit.
              </p>
            </form>
          ) : (
            <div className="thinking-panel">
              <span className="thinking-avatar" aria-hidden>
                {buzzedPlayer.avatar}
              </span>
              <div>
                <strong>{buzzedPlayer.name} heeft gebeld!</strong>
                <p>Nu telt elk woord. De rest houdt de adem in.</p>
              </div>
              <span className="thinking-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>
      )}

      {shootout.stage === 'open' && !shootout.lastWrong && (
        <p className="buzz-hint">
          <span aria-hidden>⌨️</span>{' '}
          {online
            ? 'Druk op je eigen cijfer of klik op je buzzer zodra je het weet.'
            : 'Druk op je cijfer (1, 2 of 3) of klik op je buzzer zodra je het weet.'}
        </p>
      )}

      {eliminatedPlayers.length > 0 && shootout.stage !== 'result' && (
        <div className="eliminated-row">
          <span>Uitgeschakeld:</span>
          {eliminatedPlayers.map((player) => (
            <span key={player.id} className="eliminated-chip">
              {player.avatar} {player.name}
            </span>
          ))}
        </div>
      )}

      {shootout.stage === 'result' && (
        <div className={`shootout-result ${winner ? 'is-winner' : ''}`}>
          <div>
            <span className="eyebrow">
              {winner ? 'De shootout is beslist' : 'Geen winnaar'}
            </span>
            <h3>
              {winner
                ? `${winner.avatar} ${winner.name} wint ${formatMoney(shootout.bonus + state.pot)}!`
                : 'Niemand durfde of kon het goed beantwoorden.'}
            </h3>
            <p>
              {winner && state.pot > 0 && (
                <>
                  {formatMoney(shootout.bonus)} shootoutbonus +{' '}
                  {formatMoney(state.pot)} uit de pot. Het juiste antwoord was{' '}
                </>
              )}
              {!(winner && state.pot > 0) && <>Het juiste antwoord was </>}
              <strong>{shootout.question.answers[0]}</strong>.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--gold"
            onClick={() => dispatch({ type: 'finishShootout' })}
          >
            Verder
            <span aria-hidden>→</span>
          </button>
        </div>
      )}
    </section>
  );
}
