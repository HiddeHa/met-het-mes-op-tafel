import {
  botAnswerDelay,
  botBetDelay,
  botShootoutAnswerDelay,
  chooseBotAnswers,
  chooseBotShootoutAnswer,
  decideBotBet,
  planBotBuzzes,
} from '../src/game/ai';
import type { GameAction, GameState } from '../src/game/types';
import type { BotPlan, Room } from './room';

const DISCONNECTED_ACTION_MS = 15_000;

function disconnected(room: Room, gameId: string | null): boolean {
  if (!gameId) return false;
  const player = room.players.find((candidate) => candidate.gameId === gameId);
  return Boolean(player && !player.connected);
}

export function planKeyFor(room: Room): string {
  const state = room.state;
  if (!state) return 'no-state';

  const players = state.players
    .map(
      (player) =>
        `${player.id}:${player.locked ? 1 : 0}:${player.folded ? 1 : 0}:${
          player.hasActed ? 1 : 0
        }:${player.bet}:${player.bankroll}`,
    )
    .join('|');
  const presence = room.players
    .map((player) => `${player.id}:${player.connected ? 1 : 0}:${player.gameId ?? ''}`)
    .join('|');
  const shootout = state.shootout;

  return [
    state.phase,
    state.round,
    state.answerStage,
    state.activeAnswerer ?? '',
    state.currentBidder ?? '',
    state.highestBet,
    state.questions.map((question) => question.id).join(','),
    shootout?.stage ?? '',
    shootout?.question.id ?? '',
    shootout?.buzzedBy ?? '',
    shootout?.eliminated.length ?? 0,
    players,
    presence,
  ].join('::');
}

function disconnectedAction(state: GameState, playerId: string | null): GameAction | null {
  if (!playerId) return null;
  if (state.phase === 'answering' && state.activeAnswerer !== null) {
    return { type: 'submitAnswers', answers: ['', '', '', ''] };
  }
  if (state.phase === 'betting' && state.currentBidder !== null) {
    return { type: 'foldBet' };
  }
  if (state.phase === 'shootout' && state.shootout?.stage === 'answering') {
    return { type: 'shootoutAnswer', text: '' };
  }
  return null;
}

export function buildBotPlans(room: Room, now: number): BotPlan[] {
  const state = room.state;
  if (!state) return [];
  const plans: BotPlan[] = [];
  const add = (delay: number, action: GameAction) => {
    plans.push({ at: now + Math.max(250, delay), action });
  };

  if (state.phase === 'answering' && state.answerStage === 'turn') {
    if (state.config?.simultaneous) {
      // Everyone writes at once, so every open bot sheet is scheduled in
      // parallel instead of waiting for its turn.
      for (const player of state.players) {
        if (player.locked) continue;
        if (player.isBot) {
          add(botAnswerDelay(state, player), {
            type: 'submitAnswers',
            answers: chooseBotAnswers(state, player),
            playerId: player.id,
          });
        } else if (disconnected(room, player.id)) {
          add(DISCONNECTED_ACTION_MS, {
            type: 'submitAnswers',
            answers: ['', '', '', ''],
            playerId: player.id,
          });
        }
      }
    } else if (state.activeAnswerer !== null) {
      const player = state.players[state.activeAnswerer];
      if (player?.isBot) {
        add(botAnswerDelay(state, player), {
          type: 'submitAnswers',
          answers: chooseBotAnswers(state, player),
        });
      } else if (player && disconnected(room, player.id)) {
        const action = disconnectedAction(state, player.id);
        if (action) add(DISCONNECTED_ACTION_MS, action);
      }
    }
  }

  if (state.phase === 'betting' && state.currentBidder !== null) {
    const player = state.players[state.currentBidder];
    if (player?.isBot) {
      const decision = decideBotBet(state, state.currentBidder);
      if (decision.kind === 'bet') {
        add(botBetDelay(state, player), {
          type: 'placeBet',
          amount: decision.amount ?? 10,
        });
      } else if (decision.kind === 'call') {
        add(botBetDelay(state, player), { type: 'callBet' });
      } else {
        add(botBetDelay(state, player), { type: 'foldBet' });
      }
    } else if (player && disconnected(room, player.id)) {
      const action = disconnectedAction(state, player.id);
      if (action) add(DISCONNECTED_ACTION_MS, action);
    }
  }

  if (state.phase === 'shootout' && state.shootout) {
    const shootout = state.shootout;
    if (shootout.stage === 'open') {
      for (const plan of planBotBuzzes(state)) {
        add(plan.delayMs, { type: 'buzz', playerId: plan.playerId });
      }
    } else if (shootout.stage === 'answering' && shootout.buzzedBy) {
      const player = state.players.find((candidate) => candidate.id === shootout.buzzedBy);
      if (player?.isBot) {
        add(botShootoutAnswerDelay(state, player), {
          type: 'shootoutAnswer',
          text: chooseBotShootoutAnswer(state, player),
        });
      } else if (player && disconnected(room, player.id)) {
        add(8000, { type: 'shootoutAnswer', text: '' });
      }
    }
  }

  return plans;
}
