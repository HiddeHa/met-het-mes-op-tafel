import rawQuestions from './data/questions.json';
import { shuffle, makeRng } from './rng';
import type {
  Category,
  GameConfig,
  GameState,
  Player,
  Question,
  QuestionDeck,
} from './types';

export const QUESTIONS = rawQuestions as unknown as Question[];

export const CATEGORIES: Category[] = [
  'Geschiedenis',
  'Muziek',
  'Geografie',
  'Kunst',
  'Actualiteit',
  'Wetenschap',
  'Sport',
  'Memes',
];

export const START_BANKROLL = 750;
export const QUESTIONS_PER_ROUND = 4;
export const MIN_BET = 10;
/** Maximale verhoging bovenop de verplichte inzet van de ronde. */
export const MAX_BET = 50;
export const BET_STEP = 10;
export const SHOOTOUT_BONUS = 100;
export const MAX_SHOOTOUTS = 4;
export const MAX_ROUNDS = 9;

export const PREVIEW_SECONDS = 20;
export const ANSWER_SECONDS = 90;
export const ANSWER_REVEAL_SECONDS = 20;
export const BET_SECONDS = 25;
export const SHOOTOUT_OPEN_SECONDS = 10;
export const SHOOTOUT_REOPEN_SECONDS = 6;
export const SHOOTOUT_ANSWER_SECONDS = 8;
export const SHOOTOUT_COUNTDOWN = 3;

export const AVATARS = ['🦊', '🦉', '🐺'] as const;
export const BOT_NAMES = ['Sanne', 'Daan', 'Noor'] as const;
const BOT_SKILLS = [0.66, 0.76, 0.7];

export function humanCount(mode: GameConfig['mode']): number {
  if (mode === 'solo') return 1;
  if (mode === 'duo') return 2;
  return 3;
}

export function createPlayers(config: GameConfig): Player[] {
  const humans = humanCount(config.mode);
  const seatsForBots = 3 - humans;
  const bots = Math.max(0, Math.min(seatsForBots, config.bots ?? seatsForBots));
  const usedNames = new Set(config.names.filter(Boolean));
  const availableBotNames = BOT_NAMES.filter((name) => !usedNames.has(name));
  const players: Player[] = [];

  for (let i = 0; i < humans; i++) {
    const fallback = `Speler ${i + 1}`;
    players.push(makePlayer({
      index: i,
      name: config.names[i]?.trim() || fallback,
      isBot: false,
      skill: 0,
    }));
  }

  for (let i = 0; i < bots; i++) {
    players.push(makePlayer({
      index: humans + i,
      name: availableBotNames[i] ?? `Bot ${i + 1}`,
      isBot: true,
      skill: BOT_SKILLS[i % BOT_SKILLS.length],
    }));
  }

  return players;
}

function makePlayer(input: {
  index: number;
  name: string;
  isBot: boolean;
  skill: number;
}): Player {
  return {
    id: `p${input.index}`,
    name: input.name,
    avatar: AVATARS[input.index % AVATARS.length],
    isBot: input.isBot,
    skill: input.skill,
    bankroll: START_BANKROLL,
    answers: emptyAnswers(),
    locked: false,
    correctAnswers: null,
    correctCount: null,
    folded: false,
    bet: 0,
    hasActed: false,
  };
}

export function emptyAnswers(): string[] {
  return Array.from({ length: QUESTIONS_PER_ROUND }, () => '');
}

/** Verplichte inzet per ronde: 10, 20, 40 en daarna 80. */
export function getRoundStake(round: number): number {
  if (round <= 1) return 10;
  if (round === 2) return 20;
  if (round === 3) return 40;
  return 80;
}

export function pickRoundQuestions(
  pool: Question[],
  usedIds: string[],
  count = QUESTIONS_PER_ROUND,
): Question[] {
  const used = new Set(usedIds);
  const available = pool.filter((question) => !used.has(question.id));
  const picked: Question[] = [];
  const categories = new Set<Category>();

  for (const question of available) {
    if (picked.length >= count) break;
    if (categories.has(question.category)) continue;
    picked.push(question);
    categories.add(question.category);
  }
  for (const question of available) {
    if (picked.length >= count) break;
    if (picked.includes(question)) continue;
    picked.push(question);
  }

  return picked;
}

export function difficultyLabel(difficulty: Question['difficulty']): string {
  return difficulty === 1 ? 'Makkelijk' : difficulty === 2 ? 'Gemiddeld' : 'Moeilijk';
}

export const DECK_LABELS: Record<QuestionDeck, string> = {
  classic: 'Klassiek',
  memes: 'Memes',
};

/** The question bank split in two: the classic bank and the meme bank. */
export function deckQuestions(deck: QuestionDeck = 'classic'): Question[] {
  return QUESTIONS.filter((question) =>
    deck === 'memes'
      ? question.category === 'Memes'
      : question.category !== 'Memes',
  );
}

/**
 * The meme bank is smaller, so a nine-round game would run dry. Seven rounds
 * plus the shootout still fit inside its thirty questions.
 */
export function maxRoundsForDeck(deck: QuestionDeck = 'classic'): number {
  return deck === 'memes' ? 7 : MAX_ROUNDS;
}

export function roundOptionsForDeck(deck: QuestionDeck = 'classic'): number[] {
  return deck === 'memes' ? [5, 7] : [5, 7, 9];
}

export function shufflePool(seed: number, deck: QuestionDeck = 'classic'): Question[] {
  return shuffle(makeRng(seed, 'pool'), deckQuestions(deck));
}

export function nextSeat(
  from: number,
  count: number,
  predicate: (index: number) => boolean,
): number | null {
  for (let offset = 1; offset <= count; offset++) {
    const index = (from + offset) % count;
    if (predicate(index)) return index;
  }
  return null;
}

export function getLeaderboard(players: Player[]): Player[] {
  return [...players].sort((a, b) => b.bankroll - a.bankroll);
}

export function leaders(players: Player[]): Player[] {
  if (!players.length) return [];
  const top = Math.max(...players.map((player) => player.bankroll));
  return players.filter((player) => player.bankroll === top);
}

export function formatMoney(amount: number): string {
  return `€ ${amount.toLocaleString('nl-NL')}`;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} en ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
}

export interface BidLimits {
  maxTotal: number;
  callTarget: number;
  callCost: number;
  canCall: boolean;
  canRaise: boolean;
  minRaise: number;
  allIn: boolean;
}

export function getBetCap(state: Pick<GameState, 'roundStake'>): number {
  return state.roundStake + MAX_BET;
}

export function getBidLimits(state: GameState): BidLimits | null {
  if (state.currentBidder === null) return null;
  const player = state.players[state.currentBidder];
  if (!player) return null;

  const maxTotal = Math.min(getBetCap(state), player.bet + player.bankroll);
  const callTarget = Math.min(state.highestBet, maxTotal);
  const callCost = Math.max(0, callTarget - player.bet);
  const legalMin = state.highestBet === 0 ? MIN_BET : state.highestBet + BET_STEP;
  const minRaise = Math.min(legalMin, maxTotal);
  const canRaise = maxTotal > state.highestBet;

  return {
    maxTotal,
    callTarget,
    callCost,
    canCall: state.highestBet > player.bet && callCost > 0,
    canRaise,
    minRaise,
    allIn: maxTotal < legalMin,
  };
}

export function isShootoutQuestionAvailable(state: GameState): boolean {
  const used = new Set(state.usedQuestionIds);
  return state.pool.some((question) => !used.has(question.id));
}
