import { useEffect, useReducer } from 'react';
import {
  botAnswerDelay,
  botBetDelay,
  botShootoutAnswerDelay,
  chooseBotAnswers,
  chooseBotShootoutAnswer,
  decideBotBet,
  planBotBuzzes,
} from '../game/ai';
import { gameReducer, createInitialState } from '../game/machine';
import type { GameAction, GameState } from '../game/types';

export interface GameController {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export function useGame(paused = false): GameController {
  const [state, dispatch] = useReducer(
    gameReducer,
    undefined,
    createInitialState,
  );
  const questionsKey = state.questions.map((question) => question.id).join('-');

  useEffect(() => {
    if (paused) return;
    if (
      state.phase !== 'answering' &&
      state.phase !== 'answerReveal' &&
      state.phase !== 'betting' &&
      state.phase !== 'shootout'
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      dispatch({ type: 'tick' });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [state.phase, paused]);

  // Bots answer when it is their turn.
  useEffect(() => {
    if (paused) return;
    if (state.phase !== 'answering' || state.answerStage !== 'turn') return;
    if (state.activeAnswerer === null) return;
    const player = state.players[state.activeAnswerer];
    if (!player?.isBot) return;

    const timer = window.setTimeout(() => {
      dispatch({
        type: 'submitAnswers',
        answers: chooseBotAnswers(state, player),
      });
    }, botAnswerDelay(state, player));

    return () => window.clearTimeout(timer);
  }, [
    state.phase,
    state.answerStage,
    state.activeAnswerer,
    state.round,
    questionsKey,
    paused,
  ]);

  // Bots place bets on their turn.
  useEffect(() => {
    if (paused) return;
    if (state.phase !== 'betting' || state.currentBidder === null) return;
    const player = state.players[state.currentBidder];
    if (!player?.isBot) return;
    const bidder = state.currentBidder;

    const timer = window.setTimeout(() => {
      const decision = decideBotBet(state, bidder);
      if (decision.kind === 'bet') {
        dispatch({ type: 'placeBet', amount: decision.amount ?? 10 });
      } else if (decision.kind === 'call') {
        dispatch({ type: 'callBet' });
      } else {
        dispatch({ type: 'foldBet' });
      }
    }, botBetDelay(state, player));

    return () => window.clearTimeout(timer);
  }, [
    state.phase,
    state.currentBidder,
    state.highestBet,
    state.round,
    questionsKey,
    paused,
  ]);

  // Bots race to the buzzer in the shootout.
  useEffect(() => {
    if (paused) return;
    if (state.phase !== 'shootout' || state.shootout?.stage !== 'open') return;
    const plans = planBotBuzzes(state);
    const timers = plans.map((plan) =>
      window.setTimeout(() => {
        dispatch({ type: 'buzz', playerId: plan.playerId });
      }, plan.delayMs),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [
    state.phase,
    state.shootout?.stage,
    state.shootout?.buzzedBy,
    state.shootout?.eliminated.length,
    state.shootout?.question.id,
    paused,
  ]);

  // Bots answer after they buzz.
  useEffect(() => {
    if (paused) return;
    if (state.phase !== 'shootout' || state.shootout?.stage !== 'answering') return;
    const buzzedBy = state.shootout.buzzedBy;
    if (!buzzedBy) return;
    const player = state.players.find((candidate) => candidate.id === buzzedBy);
    if (!player?.isBot) return;

    const timer = window.setTimeout(() => {
      dispatch({
        type: 'shootoutAnswer',
        text: chooseBotShootoutAnswer(state, player),
      });
    }, botShootoutAnswerDelay(state, player));

    return () => window.clearTimeout(timer);
  }, [
    state.phase,
    state.shootout?.stage,
    state.shootout?.buzzedBy,
    state.shootout?.question.id,
    state.shootout?.eliminated.length,
    paused,
  ]);

  return { state, dispatch };
}
