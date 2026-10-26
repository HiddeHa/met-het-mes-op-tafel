import { describe, expect, it } from 'vitest';
import {
  ANSWER_REVEAL_SECONDS,
  ANSWER_SECONDS,
  PREVIEW_SECONDS,
  START_BANKROLL,
  getRoundStake,
} from './engine';
import { gameReducer, createInitialState } from './machine';
import type { GameConfig, GameState } from './types';

const CONFIG: GameConfig = {
  mode: 'local',
  names: ['Ada', 'Bram', 'Cleo'],
  rounds: 7,
  seed: 42,
};

function start(overrides: Partial<GameConfig> = {}): GameState {
  return gameReducer(createInitialState(), {
    type: 'startGame',
    config: { ...CONFIG, ...overrides },
  });
}

function tick(state: GameState, times: number): GameState {
  let next = state;
  for (let i = 0; i < times; i++) next = gameReducer(next, { type: 'tick' });
  return next;
}

function answerSheet(
  state: GameState,
  textFor: (state: GameState, playerId: string) => string[],
): GameState {
  let next = gameReducer(state, { type: 'beginAnswering' });
  let guard = 0;
  while (next.phase === 'answering' && next.answerStage === 'turn') {
    if (guard++ > 10) throw new Error('answering did not advance');
    const active = next.players[next.activeAnswerer ?? 0];
    next = gameReducer(next, {
      type: 'submitAnswers',
      answers: textFor(next, active.id),
    });
  }
  return next;
}

function allCorrect(state: GameState): string[] {
  return state.questions.map((question) => question.answers[0]);
}

function allWrong(state: GameState): string[] {
  return state.questions.map(() => 'totaal onjuist antwoord');
}

/** Dismiss the answer reveal and open the betting round. */
function openBetting(state: GameState): GameState {
  return state.phase === 'answerReveal'
    ? gameReducer(state, { type: 'startBetting' })
    : state;
}

function foldRound(state: GameState): GameState {
  let next = openBetting(state);
  let guard = 0;
  while (next.phase === 'betting') {
    if (guard++ > 10) throw new Error('betting did not resolve');
    next = gameReducer(next, { type: 'foldBet' });
  }
  return next;
}

describe('round setup', () => {
  it('starts with €750, four questions and obligatory stakes in the pot', () => {
    const state = start();
    expect(state.phase).toBe('answering');
    expect(state.answerStage).toBe('preview');
    expect(state.players).toHaveLength(3);
    expect(state.players.every((player) => player.bankroll === START_BANKROLL - 10)).toBe(true);
    expect(state.players.every((player) => player.bet === 10)).toBe(true);
    expect(state.players.every((player) => player.answers.length === 4)).toBe(true);
    expect(state.questions).toHaveLength(4);
    expect(new Set(state.questions.map((question) => question.category)).size).toBe(4);
    expect(state.pot).toBe(30);
    expect(state.roundStake).toBe(10);
    expect(state.highestBet).toBe(10);
    expect(state.round).toBe(1);
    expect(state.timeLeft).toBe(PREVIEW_SECONDS);
  });

  it('creates sibling bots in solo mode', () => {
    const state = start({ mode: 'solo', names: ['Je eigen naam'] });
    expect(state.players.filter((player) => player.isBot)).toHaveLength(2);
    expect(state.players[0].name).toBe('Je eigen naam');
  });

  it('uses four fresh questions every round', () => {
    let state = start({ rounds: 5 });
    state = foldRound(answerSheet(state, allWrong));
    expect(state.phase).toBe('reveal');
    state = gameReducer(state, { type: 'nextRound' });
    expect(state.round).toBe(2);
    expect(state.usedQuestionIds).toHaveLength(8);
    expect(new Set(state.usedQuestionIds).size).toBe(8);
  });

  it('raises the obligatory stake each round: 10, 20, 40, then 80', () => {
    let state = start({ rounds: 7 });
    const stakes = [10, 20, 40, 80];
    let expectedBankroll = START_BANKROLL;
    for (const stake of stakes) {
      expect(state.roundStake).toBe(stake);
      expect(state.players.every((player) => player.bet === stake)).toBe(true);
      expectedBankroll -= stake;
      expect(state.players.every((player) => player.bankroll === expectedBankroll)).toBe(true);
      state = foldRound(answerSheet(state, allWrong));
      state = gameReducer(state, { type: 'nextRound' });
    }
    expect(getRoundStake(8)).toBe(80);
  });
});

describe('answering phase', () => {
  it('locks four answers per player, then shows the answers before bidding', () => {
    let state = answerSheet(start(), allCorrect);
    expect(state.phase).toBe('answerReveal');
    expect(state.players.every((player) => player.locked)).toBe(true);
    expect(state.players.every((player) => player.answers.length === 4)).toBe(true);
    expect(state.players[0].answers).toEqual(allCorrect(state));
    expect(state.pot).toBe(30);
    expect(state.highestBet).toBe(10);
    expect(state.timeLeft).toBe(ANSWER_REVEAL_SECONDS);

    state = openBetting(state);
    expect(state.phase).toBe('betting');
    expect(state.currentBidder).not.toBeNull();
  });

  it('keeps the sheets closed during the answer reveal', () => {
    const state = answerSheet(start(), allCorrect);
    expect(state.phase).toBe('answerReveal');
    expect(state.questions.every((question) => question.answers.length > 0)).toBe(true);
    expect(state.players.every((player) => player.correctAnswers === null)).toBe(true);
    expect(state.players.every((player) => player.correctCount === null)).toBe(true);
    expect(state.results).toEqual([]);
    expect(state.reveal).toBeNull();
  });

  it('refuses bids until the answer reveal is dismissed', () => {
    const state = answerSheet(start(), allCorrect);
    expect(state.phase).toBe('answerReveal');
    const unchanged = gameReducer(state, { type: 'placeBet', amount: 20 });
    expect(unchanged).toBe(state);
    const stillOpen = gameReducer(state, { type: 'foldBet' });
    expect(stillOpen).toBe(state);
  });

  it('opens the betting round when the answer-reveal timer runs out', () => {
    const state = tick(answerSheet(start(), allCorrect), ANSWER_REVEAL_SECONDS);
    expect(state.phase).toBe('betting');
    expect(state.currentBidder).not.toBeNull();
  });

  it('auto-locks an empty sheet when the timer expires', () => {
    let state = gameReducer(start(), { type: 'beginAnswering' });
    const first = state.activeAnswerer;
    state = tick(state, 90);
    expect(state.players[first ?? 0].locked).toBe(true);
    expect(state.players[first ?? 0].answers).toEqual(['', '', '', '']);
    expect(state.activeAnswerer).not.toBe(first);
  });

  it('starts the answering turn after the preview timer', () => {
    const state = tick(start(), PREVIEW_SECONDS);
    expect(state.answerStage).toBe('turn');
    expect(state.activeAnswerer).not.toBeNull();
  });

  describe('when the whole table answers at once', () => {
    const online = (): GameState => start({ simultaneous: true });

    it('opens every sheet on one shared clock', () => {
      const state = gameReducer(online(), { type: 'beginAnswering' });
      expect(state.answerStage).toBe('turn');
      expect(state.activeAnswerer).toBeNull();
      expect(state.timeLeft).toBe(ANSWER_SECONDS);
      expect(state.players.every((player) => !player.locked)).toBe(true);
    });

    it('locks sheets in any order and shows the answers after the last one', () => {
      let state = gameReducer(online(), { type: 'beginAnswering' });

      state = gameReducer(state, {
        type: 'submitAnswers',
        answers: ['een', 'twee', 'drie', 'vier'],
        playerId: 'p2',
      });
      expect(state.phase).toBe('answering');
      expect(state.players[2].locked).toBe(true);
      expect(state.players[0].locked).toBe(false);

      state = gameReducer(state, {
        type: 'submitAnswers',
        answers: ['een', '', '', ''],
        playerId: 'p0',
      });
      expect(state.phase).toBe('answering');

      state = gameReducer(state, {
        type: 'submitAnswers',
        answers: ['een', 'twee', 'drie', 'vier'],
        playerId: 'p1',
      });
      expect(state.phase).toBe('answerReveal');
      expect(state.players.every((player) => player.locked)).toBe(true);

      state = openBetting(state);
      expect(state.phase).toBe('betting');
      expect(state.currentBidder).not.toBeNull();
    });

    it('ignores a second sheet from the same player', () => {
      let state = gameReducer(online(), { type: 'beginAnswering' });
      state = gameReducer(state, {
        type: 'submitAnswers',
        answers: ['een', 'twee', 'drie', 'vier'],
        playerId: 'p0',
      });
      state = gameReducer(state, {
        type: 'submitAnswers',
        answers: ['overschreven', '', '', ''],
        playerId: 'p0',
      });
      expect(state.players[0].answers).toEqual(['een', 'twee', 'drie', 'vier']);
    });

    it('locks every open sheet empty when the shared clock runs out', () => {
      let state = gameReducer(online(), { type: 'beginAnswering' });
      state = gameReducer(state, {
        type: 'submitAnswers',
        answers: ['een', 'twee', 'drie', 'vier'],
        playerId: 'p1',
      });
      state = tick(state, ANSWER_SECONDS);
      expect(state.phase).toBe('answerReveal');
      expect(state.players.every((player) => player.locked)).toBe(true);
      expect(state.players[0].answers).toEqual(['', '', '', '']);
      expect(state.players[1].answers).toEqual(['een', 'twee', 'drie', 'vier']);
    });

    it('keeps the sequential turns for local tables', () => {
      const state = gameReducer(start(), { type: 'beginAnswering' });
      expect(state.activeAnswerer).not.toBeNull();
      expect(state.config?.simultaneous).toBeFalsy();
    });
  });

  describe('question sets', () => {
    it('keeps the classic bank free of meme questions', () => {
      const state = start();
      expect(state.pool.some((question) => question.category === 'Memes')).toBe(false);
      expect(state.questions.every((question) => question.category !== 'Memes')).toBe(
        true,
      );
    });

    it('deals only meme questions in the meme set', () => {
      const state = start({ deck: 'memes', rounds: 5 });
      expect(state.pool.length).toBe(30);
      expect(state.pool.every((question) => question.category === 'Memes')).toBe(true);
      expect(state.questions).toHaveLength(4);
      expect(state.questions.every((question) => question.category === 'Memes')).toBe(
        true,
      );
    });

    it('plays a full meme-set round without mixing in other categories', () => {
      let state = openBetting(answerSheet(start({ deck: 'memes', rounds: 5 }), allCorrect));
      expect(state.phase).toBe('betting');
      state = foldRound(state);
      expect(state.phase).toBe('reveal');
      expect(state.questions.every((question) => question.category === 'Memes')).toBe(
        true,
      );
      expect(state.players.every((player) => player.locked)).toBe(true);
    });
  });

  it('plays a two-player online table to the end without a bot', () => {
    let state = start({
      mode: 'duo',
      names: ['Ada', 'Bram'],
      simultaneous: true,
      bots: 0,
      rounds: 3,
    });
    expect(state.players).toHaveLength(2);
    expect(state.players.some((player) => player.isBot)).toBe(false);
    expect(state.pot).toBe(20);

    let guard = 0;
    while (state.phase !== 'gameOver' && guard++ < 300) {
      if (state.phase === 'answering') {
        if (state.answerStage === 'preview') {
          state = gameReducer(state, { type: 'beginAnswering' });
          continue;
        }
        for (const player of state.players.filter((entry) => !entry.locked)) {
          state = gameReducer(state, {
            type: 'submitAnswers',
            answers: allCorrect(state),
            playerId: player.id,
          });
        }
      } else if (state.phase === 'answerReveal') {
        state = gameReducer(state, { type: 'startBetting' });
      } else if (state.phase === 'betting') {
        state = gameReducer(state, { type: 'foldBet' });
      } else if (state.phase === 'reveal') {
        state = gameReducer(state, { type: 'nextRound' });
      } else if (state.phase === 'shootout' && state.shootout) {
        const shot = state.shootout;
        if (shot.stage === 'countdown') {
          state = tick(state, 3);
        } else if (shot.stage === 'open') {
          const live = state.players.find(
            (player) => !shot.eliminated.includes(player.id),
          );
          if (!live) break;
          state = gameReducer(state, { type: 'buzz', playerId: live.id });
        } else if (shot.stage === 'answering') {
          state = gameReducer(state, {
            type: 'shootoutAnswer',
            text: 'zeker niet goed',
          });
        } else {
          state = gameReducer(state, { type: 'finishShootout' });
        }
      } else {
        break;
      }
    }

    expect(guard).toBeLessThan(300);
    expect(state.phase).toBe('gameOver');
    expect(state.players.every((player) => player.bankroll >= 0)).toBe(true);
  });
});

describe('bidding phase', () => {
  it('rejects raises below the obligatory stake or beyond the table cap', () => {
    let state = openBetting(answerSheet(start(), allCorrect));
    const bidder = state.currentBidder ?? 0;
    expect(state.players[bidder].bet).toBe(10);
    state = gameReducer(state, { type: 'placeBet', amount: 5 });
    expect(state.highestBet).toBe(10);
    state = gameReducer(state, { type: 'placeBet', amount: 10 });
    expect(state.highestBet).toBe(10);
    state = gameReducer(state, { type: 'placeBet', amount: 20 });
    expect(state.highestBet).toBe(20);
    state = gameReducer(state, { type: 'placeBet', amount: 15 });
    expect(state.highestBet).toBe(20);
    state = gameReducer(state, { type: 'placeBet', amount: 70 });
    expect(state.highestBet).toBe(20);
    state = gameReducer(state, { type: 'callBet' });
    state = gameReducer(state, { type: 'callBet' });
    expect(state.phase).toBe('reveal');
    expect(state.players.every((player) => player.bet === 20)).toBe(true);
    expect(state.pot).toBe(0);
    expect(state.reveal?.potAwarded).toBe(60);
  });

  it('allows raises above the obligation in later rounds', () => {
    let state = start({ rounds: 5 });
    for (let round = 1; round <= 3; round++) {
      state = foldRound(answerSheet(state, allWrong));
      state = gameReducer(state, { type: 'nextRound' });
    }
    expect(state.round).toBe(4);
    expect(state.roundStake).toBe(80);
    state = openBetting(answerSheet(state, allCorrect));
    const bidder = state.currentBidder ?? 0;
    expect(state.players[bidder].bet).toBe(80);
    state = gameReducer(state, { type: 'placeBet', amount: 90 });
    expect(state.highestBet).toBe(90);
    state = gameReducer(state, { type: 'placeBet', amount: 140 });
    expect(state.highestBet).toBe(90);
  });

  it('awards the pot to the player with the most correct answers', () => {
    const initial = openBetting(
      answerSheet(start(), (state, playerId) =>
        playerId === 'p1' ? allCorrect(state) : allWrong(state),
      ),
    );
    let state = gameReducer(initial, { type: 'placeBet', amount: 20 });
    const p2 = state.currentBidder ?? 0;
    expect(state.players[p2].id).toBe('p2');
    state = gameReducer(state, { type: 'foldBet' });
    state = gameReducer(state, { type: 'foldBet' });
    expect(state.phase).toBe('reveal');

    expect(state.reveal?.potWinners).toEqual(['p1']);
    expect(state.reveal?.potAwarded).toBe(40);
    expect(state.reveal?.bestCount).toBe(4);
    expect(state.players[0].bankroll).toBe(START_BANKROLL - 10);
    expect(state.players[2].bankroll).toBe(START_BANKROLL - 10);
    expect(state.players[1].bankroll).toBe(START_BANKROLL - 20 + 40);
    expect(state.players[0].correctCount).toBe(0);
  });

  it('splits a tied pot between players on the same correct count', () => {
    let state = openBetting(answerSheet(start(), allCorrect));
    state = gameReducer(state, { type: 'placeBet', amount: 20 });
    state = gameReducer(state, { type: 'callBet' });
    state = gameReducer(state, { type: 'callBet' });
    expect(state.phase).toBe('reveal');

    const shares = state.results.map((result) => result.potShare);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(60);
    expect(shares).toEqual([20, 20, 20]);
    expect(state.players.every((player) => player.bankroll === START_BANKROLL)).toBe(true);
  });

  it('gives the last active player a raise-or-fold turn after the others fold', () => {
    let state = openBetting(answerSheet(start(), allCorrect));
    state = gameReducer(state, { type: 'foldBet' });
    state = gameReducer(state, { type: 'foldBet' });
    expect(state.phase).toBe('betting');
    expect(state.currentBidder).toBe(0);

    state = gameReducer(state, { type: 'placeBet', amount: 20 });
    expect(state.phase).toBe('reveal');
    expect(state.reveal?.potWinners).toEqual(['p0']);
    expect(state.reveal?.potAwarded).toBe(40);
  });

  it('carries the pot when nobody has a correct answer', () => {
    let state = openBetting(answerSheet(start(), allWrong));
    state = gameReducer(state, { type: 'placeBet', amount: 20 });
    state = gameReducer(state, { type: 'callBet' });
    state = gameReducer(state, { type: 'callBet' });
    expect(state.phase).toBe('reveal');
    expect(state.reveal?.potWinners).toEqual([]);
    expect(state.reveal?.carried).toBe(60);
    expect(state.pot).toBe(60);

    state = gameReducer(state, { type: 'nextRound' });
    expect(state.round).toBe(2);
    expect(state.pot).toBe(120);
    expect(state.carryIn).toBe(60);
    expect(state.players.every((player) => player.bankroll === START_BANKROLL - 40)).toBe(true);
  });

  it('awards nothing when the whole table folds', () => {
    let state = openBetting(answerSheet(start(), allCorrect));
    state = gameReducer(state, { type: 'foldBet' });
    state = gameReducer(state, { type: 'foldBet' });
    state = gameReducer(state, { type: 'foldBet' });
    expect(state.phase).toBe('reveal');
    expect(state.reveal?.potAwarded).toBe(0);
    expect(state.players.every((player) => player.bankroll === START_BANKROLL - 10)).toBe(true);
    expect(state.pot).toBe(30);
  });

  it('folds the current bidder on timeout', () => {
    let state = openBetting(answerSheet(start(), allCorrect));
    const bidder = state.currentBidder ?? 0;
    state = tick(state, 25);
    expect(state.players[bidder].folded).toBe(true);
    expect(state.phase === 'betting' || state.phase === 'reveal').toBe(true);
  });

  it('offers a call that matches the highest bid', () => {
    let state = openBetting(answerSheet(start(), allCorrect));
    state = gameReducer(state, { type: 'placeBet', amount: 30 });
    const caller = state.players[state.currentBidder ?? 0];
    const before = caller.bankroll;
    state = gameReducer(state, { type: 'callBet' });
    const after = state.players.find((player) => player.id === caller.id)!;
    expect(after.bet).toBe(30);
    expect(after.bankroll).toBe(before - 20);
  });
});

describe('shootout', () => {
  function reachShootout(): GameState {
    let state = start({ rounds: 3 });
    for (let round = 1; round <= 3; round++) {
      state = foldRound(answerSheet(state, allWrong));
      expect(state.phase).toBe('reveal');
      state = gameReducer(state, { type: 'nextRound' });
    }
    return state;
  }

  it('starts after the final regular round with the carried pot', () => {
    const state = reachShootout();
    expect(state.phase).toBe('shootout');
    expect(state.shootout?.stage).toBe('countdown');
    expect(state.shootout?.countdown).toBe(3);
    expect(state.pot).toBe(210);
    expect(state.players.every((player) => player.bankroll === 680)).toBe(true);
  });

  it('gives the bonus and the remaining pot to a correct first buzzer', () => {
    let state = reachShootout();
    state = tick(state, 3);
    expect(state.shootout?.stage).toBe('open');
    state = gameReducer(state, { type: 'buzz', playerId: 'p0' });
    expect(state.shootout?.stage).toBe('answering');
    expect(state.shootout?.buzzedBy).toBe('p0');
    state = gameReducer(state, {
      type: 'shootoutAnswer',
      text: state.shootout?.question.answers[0] ?? '',
    });
    expect(state.shootout?.stage).toBe('result');
    expect(state.shootout?.winnerId).toBe('p0');

    const before = state.players[0].bankroll;
    const pot = state.pot;
    state = gameReducer(state, { type: 'finishShootout' });
    expect(state.players[0].bankroll).toBe(before + 100 + pot);
    expect(state.pot).toBe(0);
    expect(state.phase).toBe('gameOver');
  });

  it('eliminates a wrong answer and reopens the buzzers', () => {
    let state = reachShootout();
    state = tick(state, 3);
    state = gameReducer(state, { type: 'buzz', playerId: 'p0' });
    state = gameReducer(state, { type: 'shootoutAnswer', text: 'fout' });
    expect(state.shootout?.eliminated).toEqual(['p0']);
    expect(state.shootout?.stage).toBe('open');

    state = gameReducer(state, { type: 'buzz', playerId: 'p0' });
    expect(state.shootout?.buzzedBy).toBeNull();
    state = gameReducer(state, { type: 'buzz', playerId: 'p1' });
    state = gameReducer(state, {
      type: 'shootoutAnswer',
      text: state.shootout?.question.answers[0] ?? '',
    });
    expect(state.shootout?.winnerId).toBe('p1');
    const pot = state.pot;
    state = gameReducer(state, { type: 'finishShootout' });
    expect(state.players[1].bankroll).toBe(680 + 100 + pot);
  });

  it('runs another shootout while the top is tied', () => {
    let state = reachShootout();
    state = tick(state, 3);
    for (const playerId of ['p0', 'p1', 'p2']) {
      state = gameReducer(state, { type: 'buzz', playerId });
      state = gameReducer(state, { type: 'shootoutAnswer', text: 'fout' });
    }
    expect(state.shootout?.stage).toBe('result');
    state = gameReducer(state, { type: 'finishShootout' });
    expect(state.phase).toBe('shootout');
    expect(state.shootoutsPlayed).toBe(1);
    expect(state.shootout?.stage).toBe('countdown');
    expect(state.pot).toBe(210);
  });
});
