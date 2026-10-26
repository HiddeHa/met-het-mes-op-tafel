import type { Dispatch } from 'react';
import { ANSWER_REVEAL_SECONDS } from '../game/engine';
import type { GameAction, GameState } from '../game/types';
import { TimerBar } from './TimerBar';

export function AnswerRevealStage({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
}) {
  if (!state.questions.length) return null;

  return (
    <section className="stage stage--answer-reveal">
      <header className="stage-head">
        <div>
          <p className="eyebrow">Fase 2 · De antwoorden</p>
          <h2>Dit waren de antwoorden</h2>
        </div>
        <TimerBar
          value={state.timeLeft}
          max={ANSWER_REVEAL_SECONDS}
          label="Tijd tot de inzetronde"
        />
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
          </article>
        ))}
      </div>

      <div className="stage-actions">
        <button
          type="button"
          className="btn btn--gold btn--wide"
          onClick={() => dispatch({ type: 'startBetting' })}
        >
          Naar de inzetronde
          <span aria-hidden>→</span>
        </button>
        <p className="fineprint">
          Je weet nu wat goed was, maar niet wat de anderen invulden. De
          inzetronde bepaalt wie de pot claimt; de briefjes gaan pas daarna open.
        </p>
      </div>
    </section>
  );
}
