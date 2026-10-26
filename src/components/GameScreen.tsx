import type { CSSProperties, Dispatch } from 'react';
import type { GameAction, GameState } from '../game/types';
import type { OnlineGameMeta } from '../net/protocol';
import { AnsweringStage } from './AnsweringStage';
import { AnswerRevealStage } from './AnswerRevealStage';
import { BettingStage } from './BettingStage';
import { Brand } from './Brand';
import { HeaderActions } from './HeaderActions';
import { LogTicker } from './LogTicker';
import { PotDisplay } from './PotDisplay';
import { RevealStage } from './RevealStage';
import { Seat } from './Seat';
import { ShootoutStage } from './ShootoutStage';

export function GameScreen({
  state,
  dispatch,
  soundOn,
  onToggleSound,
  onOpenRules,
  onQuit,
  paused = false,
  online,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onQuit: () => void;
  paused?: boolean;
  online?: OnlineGameMeta;
}) {
  const phase = state.phase;
  const totalRounds = state.config?.rounds ?? 0;
  const shootout = state.shootout;

  const categories = [...new Set(state.questions.map((question) => question.category))];
  const categoryLabel =
    categories.length > 1
      ? `${categories.length} categorieën`
      : (categories[0] ?? 'Vier vragen');

  const stageKey =
    phase === 'answering'
      ? `answering-${state.questions.map((question) => question.id).join('-')}-${state.answerStage}-${state.activeAnswerer ?? 'none'}`
      : phase === 'answerReveal'
        ? `answer-reveal-${state.round}`
        : phase === 'betting'
        ? `betting-${state.round}-${state.currentBidder}-${state.highestBet}`
        : phase === 'reveal'
          ? `reveal-${state.round}`
          : `shootout-${shootout?.question.id}-${shootout?.stage}-${shootout?.buzzedBy ?? 'none'}`;

  return (
    <div
      className={`game game--${phase} ${phase === 'shootout' ? 'game--final' : ''} ${
        online && !online.connected ? 'game--offline' : ''
      }`}
    >
      <div className="game-glow" aria-hidden />

      <header className="topbar">
        <Brand compact />
        <div className="topbar-meta">
          <div className="round-status">
            {online && (
              <span
                className={`online-pill ${online.connected ? 'is-live' : 'is-offline'}`}
                title={`Online tafel ${online.roomCode}`}
              >
                <i aria-hidden />
                {online.roomCode}
              </span>
            )}
            <span className={`round-pill ${phase === 'shootout' ? 'is-final' : ''}`}>
              {phase === 'shootout'
                ? 'Shootout'
                : `Ronde ${state.round} / ${totalRounds}`}
            </span>
            {phase !== 'shootout' && state.questions.length > 0 && (
              <span className="category-pill">
                {state.questions.length} vragen · {categoryLabel}
              </span>
            )}
            {phase === 'shootout' && shootout && (
              <span className="category-pill">{shootout.question.category}</span>
            )}
          </div>
          <div className="round-dots" aria-hidden>
            {Array.from({ length: totalRounds }).map((_, index) => (
              <span
                key={index}
                className={
                  index + 1 < state.round || phase === 'shootout'
                    ? 'is-done'
                    : index + 1 === state.round
                      ? 'is-current'
                      : ''
                }
              />
            ))}
            <span className="round-dot-final">⚡</span>
          </div>
          <div className="topbar-actions">
            <HeaderActions
              soundOn={soundOn}
              onToggleSound={onToggleSound}
              onOpenRules={onOpenRules}
            />
            <button type="button" className="icon-btn icon-btn--text" onClick={onQuit}>
              Menu
            </button>
          </div>
        </div>
      </header>

      {online && !online.connected && (
        <div className="connection-banner" role="status">
          <span className="connection-dot" aria-hidden />
          Verbinding kwijt — we proberen opnieuw verbinding te maken…
        </div>
      )}

      <main className="game-main">
        <section
          className="seats"
          aria-label="Spelers"
          style={{ '--seat-count': state.players.length } as CSSProperties}
        >
          {state.players.map((player, index) => (
            <Seat key={player.id} state={state} player={player} index={index} />
          ))}
        </section>

        <div className="board">
          <PotDisplay state={state} />
          <div className="stage-slot" key={stageKey}>
            {phase === 'answering' && (
              <AnsweringStage state={state} dispatch={dispatch} online={online} />
            )}
            {phase === 'answerReveal' && (
              <AnswerRevealStage state={state} dispatch={dispatch} />
            )}
            {phase === 'betting' && (
              <BettingStage state={state} dispatch={dispatch} online={online} />
            )}
            {phase === 'reveal' && (
              <RevealStage state={state} dispatch={dispatch} />
            )}
            {phase === 'shootout' && (
              <ShootoutStage
                state={state}
                dispatch={dispatch}
                paused={paused}
                online={online}
              />
            )}
          </div>
        </div>

        <LogTicker entries={state.log} />
      </main>
    </div>
  );
}
