import { emptyAnswers } from '../src/game/engine';
import type { GameState, Player, Question } from '../src/game/types';

function projectQuestion(
  question: Question,
  options: { revealAnswer: boolean },
): Question {
  return {
    ...question,
    answers: options.revealAnswer ? [...question.answers] : [],
  };
}

function projectPlayer(player: Player, revealSecrets: boolean): Player {
  return {
    ...player,
    answers: revealSecrets ? [...player.answers] : emptyAnswers(),
    correctAnswers:
      revealSecrets && player.correctAnswers ? [...player.correctAnswers] : null,
    correctCount: revealSecrets ? player.correctCount : null,
  };
}

/**
 * The server keeps the complete state. Each browser receives only what it is
 * allowed to know: the correct answers appear once the sheets are locked (that
 * is the point of the reveal before betting), but other players' sheets and
 * scores stay blank until the round is settled.
 */
export function projectStateFor(state: GameState, viewerId: string): GameState {
  const viewer =
    state.players.find((player) => player.id === viewerId) ?? null;
  const roundSettled =
    state.phase === 'reveal' ||
    state.phase === 'shootout' ||
    state.phase === 'gameOver';
  const correctAnswersPublic =
    roundSettled || state.phase === 'answerReveal' || state.phase === 'betting';
  const shootoutAnswerPublic =
    state.phase === 'gameOver' || state.shootout?.stage === 'result';

  return {
    ...state,
    config: state.config ? { ...state.config, seed: 0 } : null,
    pool: [],
    usedQuestionIds: [],
    questions: state.questions.map((question) =>
      projectQuestion(question, { revealAnswer: correctAnswersPublic }),
    ),
    players: state.players.map((player) => {
      const isViewer = player.id === viewer?.id;
      return projectPlayer(player, isViewer || roundSettled);
    }),
    results: roundSettled ? state.results : [],
    shootout: state.shootout
      ? {
          ...state.shootout,
          eliminated: [...state.shootout.eliminated],
          lastWrong: state.shootout.lastWrong
            ? { ...state.shootout.lastWrong }
            : null,
          question: projectQuestion(state.shootout.question, {
            revealAnswer: shootoutAnswerPublic,
          }),
        }
      : null,
  };
}
