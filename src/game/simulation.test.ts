import { describe, expect, it } from 'vitest';
import {
  chooseBotAnswers,
  chooseBotShootoutAnswer,
  decideBotBet,
} from './ai';
import { createInitialState, gameReducer } from './machine';
import type { GameState } from './types';

function betSignature(state: GameState): string {
  return JSON.stringify({
    phase: state.phase,
    bidder: state.currentBidder,
    highest: state.highestBet,
    bets: state.players.map((player) => player.bet),
    folded: state.players.map((player) => player.folded),
  });
}

function playGame(seed: number): GameState {
  let state = gameReducer(createInitialState(), {
    type: 'startGame',
    config: {
      mode: 'solo',
      names: ['Tester'],
      rounds: 6,
      seed,
    },
  });
  let steps = 0;

  while (state.phase !== 'gameOver' && steps < 5000) {
    steps += 1;

    switch (state.phase) {
      case 'answering': {
        if (state.answerStage === 'preview') {
          state = gameReducer(state, { type: 'beginAnswering' });
          break;
        }
        if (state.activeAnswerer === null) throw new Error('no active answerer');
        const player = state.players[state.activeAnswerer];
        const answers = player.isBot
          ? chooseBotAnswers(state, player)
          : state.questions.map((question) => question.answers[0]);
        state = gameReducer(state, { type: 'submitAnswers', answers });
        break;
      }

      case 'answerReveal':
        state = gameReducer(state, { type: 'startBetting' });
        break;

      case 'betting': {
        if (state.currentBidder === null) throw new Error('no bidder');
        const signature = betSignature(state);
        const index = state.currentBidder;
        const decision = decideBotBet(state, index);
        if (decision.kind === 'bet') {
          state = gameReducer(state, {
            type: 'placeBet',
            amount: decision.amount ?? 10,
          });
        } else if (decision.kind === 'call') {
          state = gameReducer(state, { type: 'callBet' });
        } else {
          state = gameReducer(state, { type: 'foldBet' });
        }
        if (betSignature(state) === signature) {
          // defensive: never allow an invalid bot action to stall a game
          state = gameReducer(state, { type: 'foldBet' });
        }
        break;
      }

      case 'reveal':
        state = gameReducer(state, { type: 'nextRound' });
        break;

      case 'shootout': {
        const shootout = state.shootout;
        if (!shootout) throw new Error('shootout missing');
        if (shootout.stage === 'countdown') {
          state = gameReducer(state, { type: 'tick' });
        } else if (shootout.stage === 'open') {
          const available = state.players.filter(
            (player) => !shootout.eliminated.includes(player.id),
          );
          if (!available.length) throw new Error('open shootout without players');
          const chosen = available[(seed + steps) % available.length];
          state = gameReducer(state, { type: 'buzz', playerId: chosen.id });
        } else if (shootout.stage === 'answering') {
          const player = state.players.find(
            (candidate) => candidate.id === shootout.buzzedBy,
          );
          if (!player) throw new Error('buzzing player missing');
          const answer = player.isBot
            ? chooseBotShootoutAnswer(state, player)
            : (shootout.question.answers[0] ?? '');
          state = gameReducer(state, { type: 'shootoutAnswer', text: answer });
        } else {
          state = gameReducer(state, { type: 'finishShootout' });
        }
        break;
      }

      default:
        throw new Error(`unexpected phase ${state.phase}`);
    }

    for (const player of state.players) {
      expect(Number.isInteger(player.bankroll)).toBe(true);
      expect(player.bankroll).toBeGreaterThanOrEqual(0);
      expect(player.answers).toHaveLength(4);
    }
    expect(state.pot).toBeGreaterThanOrEqual(0);
  }

  return state;
}

describe('full game simulation', () => {
  it('always reaches game over without illegal state', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const final = playGame(seed);
      expect(final.phase, `seed ${seed} did not finish`).toBe('gameOver');
      const uniqueQuestions = new Set(final.usedQuestionIds);
      expect(uniqueQuestions.size).toBe(final.usedQuestionIds.length);
      expect(final.round).toBe(6);
    }
  }, 20000);
});
