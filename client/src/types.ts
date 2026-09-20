export interface Player {
  id: string;
  name: string;
  money: number;
  eliminated: boolean;
  bets: number[];
  answers: string[];
  correctCount: number;
}

export interface Question {
  category: string;
  question: string;
  acceptableAnswers: string[];
}

export interface GameState {
  roomId: string;
  round: number;
  phase: string;
  pot: number;
  players: Player[];
  questions: Question[];
  currentQ: number;
  shootoutQ: number;
  mandatoryBet: number;
  highestBet: number;
  firstPlayerId: string;
  winnerId: string | null;
  playerAnswers: { id: string; answers: string[] }[];
  shootoutCandidates: string[];
  questionAnsweredBy?: string[];
  phaseEndsAt?: number | null;
}