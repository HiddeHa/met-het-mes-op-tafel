import { describe, expect, it } from 'vitest';
import { createInitialState, gameReducer } from '../src/game/machine';
import type { GameConfig, GameState } from '../src/game/types';
import { projectStateFor } from './projection';

const CONFIG: GameConfig = {
  mode: 'duo',
  names: ['Host', 'Friend'],
  rounds: 3,
  seed: 987654,
};

function start(): GameState {
  return gameReducer(createInitialState(), {
    type: 'startGame',
    config: CONFIG,
  });
}

function answerAll(state: GameState): GameState {
  let next = gameReducer(state, { type: 'beginAnswering' });
  let guard = 0;
  while (next.phase === 'answering' && next.answerStage === 'turn') {
    if (guard++ > 10) throw new Error('answering did not advance');
    next = gameReducer(next, {
      type: 'submitAnswers',
      answers: ['Kind of Blue', 'drie', 'Higgs', 'Rijksmuseum'],
    });
  }
  return next;
}

function foldRound(state: GameState): GameState {
  let next =
    state.phase === 'answerReveal'
      ? gameReducer(state, { type: 'startBetting' })
      : state;
  let guard = 0;
  while (next.phase === 'betting') {
    if (guard++ > 10) throw new Error('betting did not resolve');
    next = gameReducer(next, { type: 'foldBet' });
  }
  return next;
}

describe('projectStateFor', () => {
  it('hides the sheets during answering', () => {
    let state = gameReducer(start(), { type: 'beginAnswering' });
    expect(state.activeAnswerer).toBe(1);

    state = gameReducer(state, {
      type: 'submitAnswers',
      answers: ['Kind of Blue', 'drie', 'Higgs', 'Rijksmuseum'],
    });
    expect(state.phase).toBe('answering');

    const hostView = projectStateFor(state, 'p0');
    const friendView = projectStateFor(state, 'p1');

    expect(hostView.players[1].answers).toEqual(['', '', '', '']);
    expect(hostView.players[1].locked).toBe(true);
    expect(hostView.questions.every((question) => question.answers.length === 0)).toBe(
      true,
    );
    expect(hostView.config?.seed).toBe(0);
    expect(hostView.pool).toEqual([]);

    expect(friendView.players[1].answers).toEqual([
      'Kind of Blue',
      'drie',
      'Higgs',
      'Rijksmuseum',
    ]);
  });

  it('shows the correct answers but no sheets during the answer reveal', () => {
    const state = answerAll(start());
    expect(state.phase).toBe('answerReveal');

    const hostView = projectStateFor(state, 'p0');
    expect(hostView.questions.every((question) => question.answers.length > 0)).toBe(
      true,
    );
    expect(hostView.players[1].answers).toEqual(['', '', '', '']);
    expect(hostView.players[1].correctAnswers).toBeNull();
    expect(hostView.results).toEqual([]);
  });

  it('reveals every sheet and question answer once the round is resolved', () => {
    const state = foldRound(answerAll(start()));
    expect(state.phase).toBe('reveal');

    const hostView = projectStateFor(state, 'p0');
    expect(hostView.players[1].answers[0]).toBe('Kind of Blue');
    expect(hostView.questions[0].answers.length).toBeGreaterThan(0);
    expect(hostView.results.length).toBe(3);
    expect(hostView.config?.seed).toBe(0);
    expect(hostView.pool).toEqual([]);
  });
});
