export type Category =
  | 'Geschiedenis'
  | 'Muziek'
  | 'Geografie'
  | 'Kunst'
  | 'Actualiteit'
  | 'Wetenschap'
  | 'Sport'
  | 'Memes';

export type Difficulty = 1 | 2 | 3;

export interface Question {
  id: string;
  category: Category;
  difficulty: Difficulty;
  question: string;
  answers: string[];
}

export type GameMode = 'solo' | 'duo' | 'local';

/** Which question set a table plays: the classic bank or the meme bank. */
export type QuestionDeck = 'classic' | 'memes';

export interface GameConfig {
  mode: GameMode;
  names: string[];
  rounds: number;
  seed: number;
  /** Question set for this game. Defaults to the classic bank. */
  deck?: QuestionDeck;
  /** Online tables: every player fills in a sheet at the same time. */
  simultaneous?: boolean;
  /** Overrides the bot count that the mode would otherwise seat. */
  bots?: number;
}

export type Phase =
  | 'menu'
  | 'answering'
  | 'answerReveal'
  | 'betting'
  | 'reveal'
  | 'shootout'
  | 'gameOver';

export interface Player {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  skill: number;
  bankroll: number;
  answers: string[];
  locked: boolean;
  correctAnswers: boolean[] | null;
  correctCount: number | null;
  folded: boolean;
  bet: number;
  hasActed: boolean;
}

export interface PlayerRoundResult {
  playerId: string;
  answers: string[];
  correct: boolean[];
  count: number;
  potShare: number;
  folded: boolean;
}

export interface RevealSummary {
  potWinners: string[];
  potAwarded: number;
  carried: number;
  bestCount: number;
}

export interface ShootoutState {
  question: Question;
  stage: 'countdown' | 'open' | 'answering' | 'result';
  countdown: number;
  timeLeft: number;
  buzzedBy: string | null;
  eliminated: string[];
  answer: string;
  correct: boolean | null;
  winnerId: string | null;
  bonus: number;
  lastWrong: { playerId: string; answer: string } | null;
}

export type GameEventKind =
  | 'lock'
  | 'bet'
  | 'fold'
  | 'buzz'
  | 'correct'
  | 'wrong'
  | 'potwin'
  | 'carry'
  | 'bonus';

export interface GameEvent {
  id: number;
  kind: GameEventKind;
  playerId?: string;
  playerName?: string;
  amount?: number;
}

export interface LogEntry {
  id: number;
  text: string;
  tone: 'neutral' | 'gold' | 'good' | 'bad';
}

export interface GameState {
  phase: Phase;
  config: GameConfig | null;
  players: Player[];
  pool: Question[];
  usedQuestionIds: string[];
  round: number;
  dealer: number;
  questions: Question[];
  roundStake: number;
  answerStage: 'preview' | 'turn';
  activeAnswerer: number | null;
  curtainOpen: boolean;
  timeLeft: number;
  pot: number;
  carryIn: number;
  highestBet: number;
  currentBidder: number | null;
  results: PlayerRoundResult[];
  reveal: RevealSummary | null;
  shootout: ShootoutState | null;
  shootoutsPlayed: number;
  lastEvent: GameEvent | null;
  eventSeq: number;
  log: LogEntry[];
  logSeq: number;
}

export interface StartGameAction {
  type: 'startGame';
  config: GameConfig;
}

export type GameAction =
  | StartGameAction
  | { type: 'beginAnswering' }
  | { type: 'openCurtain' }
  | { type: 'submitAnswers'; answers: string[]; playerId?: string }
  | { type: 'startBetting' }
  | { type: 'tick' }
  | { type: 'placeBet'; amount: number }
  | { type: 'callBet' }
  | { type: 'foldBet' }
  | { type: 'nextRound' }
  | { type: 'buzz'; playerId: string }
  | { type: 'shootoutAnswer'; text: string }
  | { type: 'finishShootout' }
  | { type: 'backToMenu' };
