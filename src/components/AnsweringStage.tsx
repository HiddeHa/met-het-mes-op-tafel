import { useEffect, useState, type Dispatch } from 'react';
import {
  ANSWER_SECONDS,
  PREVIEW_SECONDS,
  QUESTIONS_PER_ROUND,
  formatMoney,
} from '../game/engine';
import type { GameAction, GameState } from '../game/types';
import type { OnlineGameMeta } from '../net/protocol';
import { QuestionCard } from './QuestionCard';
import { TimerBar } from './TimerBar';

export function AnsweringStage({
  state,
  dispatch,
  online,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  online?: OnlineGameMeta;
}) {
  const [answers, setAnswers] = useState<string[]>(() =>
    state.questions.map(() => ''),
  );
  const [showEmptyWarning, setShowEmptyWarning] = useState(false);
  const questionsKey = state.questions.map((question) => question.id).join('-');

  useEffect(() => {
    setAnswers(state.questions.map(() => ''));
    setShowEmptyWarning(false);
  }, [state.activeAnswerer, questionsKey, state.answerStage]);

  const simultaneous = Boolean(state.config?.simultaneous);
  const active =
    state.activeAnswerer !== null
      ? state.players[state.activeAnswerer]
      : null;
  const self = simultaneous
    ? (online
        ? (state.players.find((player) => player.id === online.youId) ?? null)
        : (state.players.find((player) => !player.isBot) ?? null))
    : active;
  const sheetOwner = simultaneous ? self : active;
  const lockedCount = state.players.filter((player) => player.locked).length;
  const filled = answers.filter((answer) => answer.trim()).length;
  const stillWriting = state.players.filter((player) => !player.locked);

  const setAnswerAt = (index: number, value: string) => {
    setAnswers((current) =>
      current.map((answer, position) => (position === index ? value : answer)),
    );
  };

  if (!state.questions.length) return null;

  if (state.answerStage === 'preview') {
    return (
      <section className="stage stage--answering">
        <header className="stage-head">
          <div>
            <p className="eyebrow">Fase 1 · Vier vragen</p>
            <h2>Iedereen leest mee</h2>
          </div>
          <TimerBar
            value={state.timeLeft}
            max={PREVIEW_SECONDS}
            label="Tijd tot antwoorden"
          />
        </header>

        <div className="stake-strip">
          <span className="stake-strip-label">Verplichte inzet</span>
          <strong>{formatMoney(state.roundStake)} per speler</strong>
          <span>
            staat al in de pot · hoogste inzet {formatMoney(state.highestBet)}
          </span>
        </div>

        <div className="qsheet">
          {state.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              number={index + 1}
              compact
            />
          ))}
        </div>

        <div className="stage-actions">
          <button
            type="button"
            className="btn btn--gold btn--wide"
            onClick={() => dispatch({ type: 'beginAnswering' })}
          >
            Iedereen klaar — deel de briefjes uit
            <span aria-hidden>→</span>
          </button>
          <p className="fineprint">
            {simultaneous
              ? 'Alle spelers vullen tegelijk dezelfde vier vragen in. De briefjes blijven geheim tot na de inzetronde; de verplichte inzet staat al in de pot.'
              : 'Alle spelers vullen dezelfde vier vragen in. De briefjes blijven geheim tot na de inzetronde; de verplichte inzet staat al in de pot.'}
          </p>
        </div>
      </section>
    );
  }

  if (!sheetOwner) return null;

  const isMySheet = !online || sheetOwner.id === online.youId;
  const mySheetLocked = Boolean(sheetOwner.locked);
  const isOtherHuman = Boolean(
    online && !simultaneous && !sheetOwner.isBot && !isMySheet,
  );
  const showInputs = simultaneous
    ? isMySheet && !mySheetLocked && !sheetOwner.isBot
    : !sheetOwner.isBot && (online ? isMySheet : state.curtainOpen);
  const waitingNames = stillWriting.map((player) => player.name);

  return (
    <section className="stage stage--answering">
      <header className="stage-head">
        <div>
          <p className="eyebrow">Fase 1 · Antwoorden op slot</p>
          <h2>
            {simultaneous
              ? mySheetLocked
                ? 'Jouw briefje staat op slot'
                : 'Iedereen vult tegelijk in'
              : sheetOwner.isBot
                ? `${sheetOwner.name} vult vier antwoorden in`
                : isOtherHuman
                  ? `${sheetOwner.name} vult het briefje in`
                  : `Aan de beurt: ${sheetOwner.name}`}
          </h2>
        </div>
        <TimerBar
          value={state.timeLeft}
          max={ANSWER_SECONDS}
          label={simultaneous ? 'Antwoordtijd hele tafel' : 'Antwoordtijd'}
        />
      </header>

      <div
        className="answer-progress"
        aria-label={`${lockedCount} van ${state.players.length} briefjes op slot`}
      >
        {state.players.map((player) => {
          const highlighted = simultaneous
            ? !player.locked
            : player.id === sheetOwner.id;
          return (
            <span
              key={player.id}
              className={`answer-pill ${player.locked ? 'is-locked' : ''} ${
                highlighted ? 'is-active' : ''
              }`}
            >
              <span aria-hidden>{player.locked ? '🔒' : player.avatar}</span>
              {player.name}
              {player.locked && (!online || player.id === online.youId) && (
                <small>
                  {player.correctCount ?? player.answers.filter(Boolean).length}/4
                </small>
              )}
            </span>
          );
        })}
        <span className="answer-count">
          {lockedCount}/{state.players.length} briefjes op slot
        </span>
      </div>

      {simultaneous && mySheetLocked ? (
        <div className="handoff handoff--waiting" aria-live="polite">
          <span className="handoff-avatar" aria-hidden>
            🔒
          </span>
          <p className="eyebrow">Jouw briefje is binnen</p>
          <h3>
            {waitingNames.length === 0
              ? 'Iedereen is klaar'
              : `Nog aan het schrijven: ${waitingNames.join(' en ')}`}
          </h3>
          <p>
            Je antwoorden blijven verborgen tot de onthulling. Zodra het laatste
            briefje op slot ligt, verschijnen de goede antwoorden op tafel.
          </p>
          <span className="waiting-pulse">
            {waitingNames.length === 0
              ? 'De antwoorden komen op tafel…'
              : `${lockedCount} van ${state.players.length} briefjes op slot`}
          </span>
        </div>
      ) : sheetOwner.isBot ? (
        <div className="thinking-panel" aria-live="polite">
          <span className="thinking-avatar" aria-hidden>
            {sheetOwner.avatar}
          </span>
          <div>
            <strong>{sheetOwner.name} schrijft vier antwoorden op…</strong>
            <p>Geen spiekbriefjes. Het briefje gaat zo op slot.</p>
          </div>
          <span className="thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : isOtherHuman ? (
        <div className="handoff handoff--waiting" aria-live="polite">
          <span className="handoff-avatar" aria-hidden>
            {sheetOwner.avatar}
          </span>
          <p className="eyebrow">Geheime beurt</p>
          <h3>{sheetOwner.name} vult het briefje in</h3>
          <p>
            Jij bent zo aan de beurt. De antwoorden van {sheetOwner.name} blijven
            verborgen tot de onthulling.
          </p>
          <span className="waiting-pulse">Wachten op {sheetOwner.name}…</span>
        </div>
      ) : !online && !state.curtainOpen ? (
        <div className="handoff">
          <span className="handoff-avatar" aria-hidden>
            {sheetOwner.avatar}
          </span>
          <p className="eyebrow">Geheime beurt</p>
          <h3>Geef het scherm aan {sheetOwner.name}</h3>
          <p>
            De vier vragen blijven staan. Jouw antwoorden ziet niemand tot de
            onthulling na de inzetronde. Zorg dat de andere spelers niet
            meekijken.
          </p>
          <button
            type="button"
            className="btn btn--gold"
            onClick={() => dispatch({ type: 'openCurtain' })}
          >
            Ik ben klaar om te antwoorden
          </button>
        </div>
      ) : (
        <div className="sheet-banner" aria-live="polite">
          <span aria-hidden>{sheetOwner.avatar}</span>
          <strong>
            {online
              ? 'Jij vult het briefje in.'
              : `${sheetOwner.name} vult het briefje in.`}
          </strong>
          <span>
            {simultaneous
              ? 'Alleen jij ziet deze antwoorden. De rest schrijft tegelijk mee.'
              : online
                ? 'Alleen jij ziet deze antwoorden.'
                : 'Anderen: niet meekijken.'}
          </span>
        </div>
      )}

      <div className="answer-sheet">
        {state.questions.map((question, index) => (
          <article className="answer-q" key={question.id}>
            <div className="answer-q-head">
              <span className="answer-num">{index + 1}</span>
              <span className="qcard-cat">{question.category}</span>
            </div>
            <p className="answer-q-text">{question.question}</p>

            {showInputs && (
              <div className="answer-q-row">
                <input
                  className="answer-input"
                  value={answers[index] ?? ''}
                  onChange={(event) => setAnswerAt(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.preventDefault();
                  }}
                  placeholder="Jouw antwoord…"
                  maxLength={140}
                  autoComplete="off"
                  autoFocus={index === 0}
                  aria-label={`Antwoord op vraag ${index + 1}`}
                />
              </div>
            )}
          </article>
        ))}
      </div>

      {showInputs && (
        <form
          className="answer-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (filled === 0) {
              setShowEmptyWarning(true);
              return;
            }
            dispatch({ type: 'submitAnswers', answers });
          }}
        >
          <div className="answer-foot">
            <div className="answer-tools">
              <span
                className={`answer-filled ${
                  filled === QUESTIONS_PER_ROUND ? 'is-complete' : ''
                }`}
              >
                {filled} van {QUESTIONS_PER_ROUND} ingevuld
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => dispatch({ type: 'submitAnswers', answers })}
              >
                Leeg briefje inleveren
              </button>
            </div>
            <p className="fineprint">
              Lege antwoorden tellen als fout. Je hoeft niet alle vier de velden
              in te vullen.
              {simultaneous &&
                ' Zodra de tijd op is, gaan de briefjes die nog openstaan leeg op slot.'}
            </p>
          </div>

          {showEmptyWarning && (
            <p className="bid-warning">
              Je hebt nog niets ingevuld. Vul minstens één antwoord in of lever
              bewust een leeg briefje in.
            </p>
          )}

          <button type="submit" className="btn btn--gold btn--wide">
            Briefje op slot
            <span aria-hidden>🔒</span>
          </button>
        </form>
      )}
    </section>
  );
}
