import { QUESTIONS_PER_ROUND, getBetCap } from './engine';
import { isCorrectAnswer } from './matching';
import { makeRng, pickOne } from './rng';
import type { GameState, Player, Question } from './types';

export interface BotBet {
  kind: 'bet' | 'call' | 'fold';
  amount?: number;
}

function knowledgeProbability(question: Question, player: Player): number {
  const base = 0.5 + player.skill * 0.5;
  const penalty = (question.difficulty - 1) * 0.22;
  return Math.min(0.94, Math.max(0.08, base - penalty));
}

function wrongAnswer(
  question: Question,
  pool: Question[],
  rng: () => number,
): string {
  const sameCategory = pool
    .filter(
      (candidate) =>
        candidate.category === question.category &&
        candidate.id !== question.id &&
        !isCorrectAnswer(question, candidate.answers[0]),
    )
    .map((candidate) => candidate.answers[0]);
  if (sameCategory.length) return pickOne(rng, sameCategory);

  const anyCategory = pool
    .filter(
      (candidate) =>
        candidate.id !== question.id &&
        !isCorrectAnswer(question, candidate.answers[0]),
    )
    .map((candidate) => candidate.answers[0]);
  if (anyCategory.length) return pickOne(rng, anyCategory);

  return 'Geen idee';
}

function pickAnswer(
  question: Question,
  pool: Question[],
  player: Player,
  rng: () => number,
): string {
  if (rng() < knowledgeProbability(question, player)) {
    return question.answers[0];
  }
  return wrongAnswer(question, pool, rng);
}

export function chooseBotAnswers(state: GameState, player: Player): string[] {
  return state.questions.map((question) => {
    const rng = makeRng(
      state.config?.seed ?? 1,
      state.round,
      player.id,
      'answer',
      question.id,
    );
    return pickAnswer(question, state.pool, player, rng);
  });
}

export function botCorrectCount(state: GameState, player: Player): number {
  return state.questions.reduce((count, question, index) => {
    const answer = player.answers[index] ?? '';
    return count + (answer.trim() && isCorrectAnswer(question, answer) ? 1 : 0);
  }, 0);
}

export function chooseBotShootoutAnswer(
  state: GameState,
  player: Player,
): string {
  const shootout = state.shootout;
  if (!shootout) return '';
  const rng = makeRng(
    state.config?.seed ?? 1,
    'shootout-answer',
    shootout.question.id,
    player.id,
    shootout.eliminated.length,
  );
  return pickAnswer(shootout.question, state.pool, player, rng);
}

function chooseRaise(
  highestBet: number,
  maxTotal: number,
  rng: () => number,
): number | null {
  if (maxTotal <= highestBet) return null;
  const steps = rng() < 0.6 ? [10, 20] : [10, 20, 30];
  const amounts = steps
    .map((step) => Math.min(maxTotal, highestBet + step))
    .filter((amount) => amount > highestBet);
  if (!amounts.length) return maxTotal > highestBet ? maxTotal : null;
  return amounts[Math.floor(rng() * amounts.length)];
}

export function decideBotBet(state: GameState, index: number): BotBet {
  const player = state.players[index];
  if (!player) return { kind: 'fold' };

  const rng = makeRng(
    state.config?.seed ?? 1,
    state.round,
    player.id,
    'bet',
    state.highestBet,
    player.bet,
    state.currentBidder ?? -1,
  );

  const maxTotal = Math.min(getBetCap(state), player.bet + player.bankroll);
  if (maxTotal <= player.bet) return { kind: 'fold' };

  const count = botCorrectCount(state, player);
  const strength = count / QUESTIONS_PER_ROUND;
  const canRaise = maxTotal > state.highestBet;
  const mustRaise = player.bet >= state.highestBet;

  // Opening action with the obligatory stake already matched: raise or pass.
  if (mustRaise) {
    let raiseChance = 0.12;
    if (strength >= 0.75) raiseChance = 0.82;
    else if (count === 2) raiseChance = 0.45;

    if (canRaise && rng() < raiseChance) {
      const amount = chooseRaise(state.highestBet, maxTotal, rng);
      if (amount !== null) return { kind: 'bet', amount };
    }
    return { kind: 'fold' };
  }

  const callTarget = Math.min(state.highestBet, player.bet + player.bankroll);
  const callCost = callTarget - player.bet;
  if (callCost <= 0) return { kind: 'fold' };

  if (strength >= 0.75) {
    if (canRaise && rng() < 0.28) {
      const amount = chooseRaise(state.highestBet, maxTotal, rng);
      if (amount !== null) return { kind: 'bet', amount };
    }
    return rng() < 0.86 ? { kind: 'call' } : { kind: 'fold' };
  }

  if (count === 2) {
    if (canRaise && rng() < 0.12) {
      const amount = chooseRaise(state.highestBet, maxTotal, rng);
      if (amount !== null) return { kind: 'bet', amount };
    }
    if (callCost <= 20 && rng() < 0.72) return { kind: 'call' };
    return rng() < 0.25 ? { kind: 'call' } : { kind: 'fold' };
  }

  if (callCost <= 10 && rng() < 0.4) return { kind: 'call' };
  if (canRaise && rng() < 0.08) {
    const amount = chooseRaise(state.highestBet, maxTotal, rng);
    if (amount !== null) return { kind: 'bet', amount };
  }
  return { kind: 'fold' };
}

export function botAnswerDelay(state: GameState, player: Player): number {
  const rng = makeRng(
    state.config?.seed ?? 1,
    state.round,
    'answer-delay',
    player.id,
    state.questions.map((question) => question.id).join('-'),
  );
  return 2200 + Math.round(rng() * 2400);
}

export function botBetDelay(state: GameState, player: Player): number {
  const rng = makeRng(
    state.config?.seed ?? 1,
    state.round,
    'bet-delay',
    player.id,
    state.highestBet,
    state.currentBidder ?? -1,
  );
  return 1200 + Math.round(rng() * 1500);
}

export function botShootoutAnswerDelay(
  state: GameState,
  player: Player,
): number {
  const rng = makeRng(
    state.config?.seed ?? 1,
    'shootout-answer-delay',
    player.id,
    state.shootout?.question.id ?? '',
    state.shootout?.eliminated.length ?? 0,
  );
  return 900 + Math.round(rng() * 1500);
}

export interface BotBuzzPlan {
  playerId: string;
  delayMs: number;
}

export function planBotBuzzes(state: GameState): BotBuzzPlan[] {
  const shootout = state.shootout;
  if (!shootout || shootout.stage !== 'open') return [];
  const seed = state.config?.seed ?? 1;
  const plans: BotBuzzPlan[] = [];

  for (const player of state.players) {
    if (!player.isBot) continue;
    if (shootout.eliminated.includes(player.id)) continue;
    const rng = makeRng(
      seed,
      'buzz',
      shootout.question.id,
      player.id,
      shootout.eliminated.length,
    );
    const probability = Math.min(
      0.9,
      knowledgeProbability(shootout.question, player) * 0.95 + 0.08,
    );
    if (rng() > probability) continue;
    const delay = 2100 + Math.round(rng() * 3000 + (1 - player.skill) * 600);
    plans.push({ playerId: player.id, delayMs: delay });
  }

  return plans;
}
