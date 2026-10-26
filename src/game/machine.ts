import {
  BET_SECONDS,
  BET_STEP,
  MAX_ROUNDS,
  MAX_SHOOTOUTS,
  MIN_BET,
  PREVIEW_SECONDS,
  ANSWER_SECONDS,
  ANSWER_REVEAL_SECONDS,
  QUESTIONS_PER_ROUND,
  SHOOTOUT_ANSWER_SECONDS,
  SHOOTOUT_COUNTDOWN,
  SHOOTOUT_BONUS,
  SHOOTOUT_OPEN_SECONDS,
  SHOOTOUT_REOPEN_SECONDS,
  createPlayers,
  emptyAnswers,
  getBetCap,
  getRoundStake,
  isShootoutQuestionAvailable,
  joinNames,
  nextSeat,
  pickRoundQuestions,
  shufflePool,
} from './engine';
import { isCorrectAnswer } from './matching';
import type {
  GameAction,
  GameEventKind,
  GameState,
  LogEntry,
  Player,
  PlayerRoundResult,
} from './types';

export function createInitialState(): GameState {
  return {
    phase: 'menu',
    config: null,
    players: [],
    pool: [],
    usedQuestionIds: [],
    round: 0,
    dealer: 0,
    questions: [],
    roundStake: 0,
    answerStage: 'preview',
    activeAnswerer: null,
    curtainOpen: false,
    timeLeft: 0,
    pot: 0,
    carryIn: 0,
    highestBet: 0,
    currentBidder: null,
    results: [],
    reveal: null,
    shootout: null,
    shootoutsPlayed: 0,
    lastEvent: null,
    eventSeq: 0,
    log: [],
    logSeq: 0,
  };
}

function clone(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      answers: [...player.answers],
      correctAnswers: player.correctAnswers ? [...player.correctAnswers] : null,
    })),
    results: state.results.map((result) => ({
      ...result,
      answers: [...result.answers],
      correct: [...result.correct],
    })),
    usedQuestionIds: [...state.usedQuestionIds],
    questions: [...state.questions],
    log: [...state.log],
    shootout: state.shootout
      ? {
          ...state.shootout,
          eliminated: [...state.shootout.eliminated],
          lastWrong: state.shootout.lastWrong
            ? { ...state.shootout.lastWrong }
            : null,
        }
      : null,
  };
}

function emit(
  state: GameState,
  kind: GameEventKind,
  playerId?: string,
  amount?: number,
): void {
  state.eventSeq += 1;
  const player = playerId
    ? state.players.find((candidate) => candidate.id === playerId)
    : undefined;
  state.lastEvent = {
    id: state.eventSeq,
    kind,
    playerId,
    playerName: player?.name,
    amount,
  };
}

function addLog(
  state: GameState,
  text: string,
  tone: LogEntry['tone'] = 'neutral',
): void {
  state.logSeq += 1;
  state.log = [
    ...state.log.slice(-39),
    { id: state.logSeq, text, tone },
  ];
}

function resetRoundPlayers(state: GameState): void {
  for (const player of state.players) {
    player.answers = emptyAnswers();
    player.locked = false;
    player.correctAnswers = null;
    player.correctCount = null;
    player.folded = false;
    player.bet = 0;
    player.hasActed = false;
  }
}

function setupRound(state: GameState, round: number): void {
  const questions = pickRoundQuestions(
    state.pool,
    state.usedQuestionIds,
    QUESTIONS_PER_ROUND,
  );
  if (questions.length < QUESTIONS_PER_ROUND) {
    state.phase = 'gameOver';
    return;
  }

  const previousPot = state.pot;
  const stake = getRoundStake(round);

  state.round = round;
  state.dealer = (round - 1) % state.players.length;
  state.questions = questions;
  state.usedQuestionIds = [
    ...state.usedQuestionIds,
    ...questions.map((question) => question.id),
  ];
  state.carryIn = previousPot;
  state.roundStake = stake;
  state.answerStage = 'preview';
  state.activeAnswerer = null;
  state.curtainOpen = false;
  state.timeLeft = PREVIEW_SECONDS;
  state.results = [];
  state.reveal = null;
  state.currentBidder = null;
  state.phase = 'answering';
  resetRoundPlayers(state);

  let paidTotal = 0;
  for (const player of state.players) {
    const paid = Math.min(stake, player.bankroll);
    player.bankroll -= paid;
    player.bet = paid;
    paidTotal += paid;
  }
  state.pot = previousPot + paidTotal;
  state.highestBet = Math.max(...state.players.map((player) => player.bet), 0);

  const categories = [...new Set(questions.map((question) => question.category))];
  addLog(
    state,
    `Ronde ${round}: vier vragen uit ${categories.join(', ')}. Verplichte inzet € ${stake} per speler.`,
    'gold',
  );
  if (previousPot > 0) {
    addLog(
      state,
      `De overgebleven € ${previousPot} schuift mee de pot in: nu € ${state.pot}.`,
      'neutral',
    );
  }
}

function isSimultaneous(state: GameState): boolean {
  return Boolean(state.config?.simultaneous);
}

function beginAnswering(state: GameState): void {
  if (state.phase !== 'answering' || state.answerStage !== 'preview') return;
  state.answerStage = 'turn';
  state.curtainOpen = false;
  state.timeLeft = ANSWER_SECONDS;

  if (isSimultaneous(state)) {
    state.activeAnswerer = null;
    addLog(
      state,
      'De vier vragen staan op tafel. Iedereen vult tegelijk zijn eigen briefje in.',
      'neutral',
    );
    return;
  }

  state.activeAnswerer = (state.dealer + 1) % state.players.length;
  addLog(
    state,
    'De vier vragen staan op tafel. Iedereen vult zijn eigen briefje in.',
    'neutral',
  );
}

function advanceAnswerer(state: GameState): void {
  if (state.activeAnswerer === null) {
    startAnswerReveal(state);
    return;
  }
  const next = nextSeat(
    state.activeAnswerer,
    state.players.length,
    (index) => !state.players[index].locked,
  );
  if (next === null) {
    startAnswerReveal(state);
    return;
  }
  state.activeAnswerer = next;
  state.curtainOpen = false;
  state.timeLeft = ANSWER_SECONDS;
}

/**
 * Who may write a sheet right now: the player whose turn it is in the local
 * modes, or any player who has not locked yet when the table answers at once.
 */
function currentAnswerer(state: GameState, playerId?: string): Player | null {
  if (isSimultaneous(state)) {
    if (!playerId) return null;
    return state.players.find((player) => player.id === playerId) ?? null;
  }
  if (state.activeAnswerer === null) return null;
  return state.players[state.activeAnswerer] ?? null;
}

function lockAnswers(
  state: GameState,
  player: Player,
  rawAnswers: string[],
): void {
  player.answers = Array.from({ length: QUESTIONS_PER_ROUND }, (_, index) =>
    (rawAnswers[index] ?? '').trim().slice(0, 140),
  );
  player.locked = true;
  const filled = player.answers.filter(Boolean).length;

  emit(state, 'lock', player.id);
  addLog(
    state,
    `${player.name} legt het briefje op slot (${filled} van ${QUESTIONS_PER_ROUND} ingevuld).`,
    filled > 0 ? 'neutral' : 'bad',
  );
}

function lockCurrentAnswers(
  state: GameState,
  rawAnswers: string[],
  playerId?: string,
): void {
  const player = currentAnswerer(state, playerId);
  if (!player || player.locked) return;

  lockAnswers(state, player, rawAnswers);

  if (isSimultaneous(state)) {
    if (state.players.every((candidate) => candidate.locked)) {
      startAnswerReveal(state);
    }
    return;
  }

  advanceAnswerer(state);
}

/**
 * The table sees the correct answers before anyone bids, so the betting round
 * is informed: you know how you did, the other sheets stay hidden.
 */
function startAnswerReveal(state: GameState): void {
  state.phase = 'answerReveal';
  state.activeAnswerer = null;
  state.curtainOpen = false;
  state.currentBidder = null;
  state.timeLeft = ANSWER_REVEAL_SECONDS;
  addLog(
    state,
    'Alle vier de briefjes staan op slot. De antwoorden liggen op tafel.',
    'gold',
  );
  addLog(state, 'Bekijk wat goed was. Daarna opent de inzetronde.', 'neutral');
}

function startBetting(state: GameState): void {
  state.phase = 'betting';
  state.answerStage = 'turn';
  state.activeAnswerer = null;
  state.curtainOpen = false;
  state.currentBidder = (state.dealer + 1) % state.players.length;
  state.timeLeft = BET_SECONDS;
  addLog(
    state,
    'De inzetronde opent. De verplichte inzet staat al in de pot.',
    'gold',
  );
  addLog(
    state,
    'Verhoog met stappen van € 10 of pas. De meeste goede antwoorden claimen de pot.',
    'neutral',
  );
}

function resolveReveal(state: GameState): void {
  if (!state.questions.length) return;

  const results: PlayerRoundResult[] = state.players.map((player) => {
    const correct = state.questions.map((question, index) => {
      const answer = player.answers[index] ?? '';
      return answer.length > 0 && isCorrectAnswer(question, answer);
    });
    const count = correct.filter(Boolean).length;

    player.correctAnswers = correct;
    player.correctCount = count;

    return {
      playerId: player.id,
      answers: [...player.answers],
      correct,
      count,
      potShare: 0,
      folded: player.folded,
    };
  });

  const contenders = state.players.filter((player) => !player.folded);
  const bestCount = contenders.length
    ? Math.max(...contenders.map((player) => player.correctCount ?? 0))
    : 0;
  const winners =
    bestCount > 0
      ? contenders.filter((player) => (player.correctCount ?? 0) === bestCount)
      : [];

  let potAwarded = 0;
  if (winners.length > 0) {
    potAwarded = state.pot;
    const share = Math.floor(potAwarded / winners.length);
    let remainder = potAwarded - share * winners.length;
    for (const winner of winners) {
      const amount = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      winner.bankroll += amount;
      const result = results.find((entry) => entry.playerId === winner.id);
      if (result) result.potShare = amount;
    }
    state.pot = 0;
  }

  state.results = results;
  state.reveal = {
    potWinners: winners.map((winner) => winner.id),
    potAwarded,
    carried: state.pot,
    bestCount,
  };
  state.phase = 'reveal';
  state.currentBidder = null;
  state.activeAnswerer = null;
  state.timeLeft = 0;

  if (bestCount === 0) {
    addLog(
      state,
      contenders.length
        ? 'Geen van de overgebleven spelers had een goed antwoord.'
        : 'Iedereen paste. Geen aanspraak op de pot.',
      'bad',
    );
  } else {
    const scoreLine = state.players
      .map((player) => `${player.name}: ${player.correctCount}/${QUESTIONS_PER_ROUND}`)
      .join(' · ');
    addLog(state, scoreLine, 'neutral');
  }

  if (winners.length > 0) {
    const names = joinNames(winners.map((winner) => winner.name));
    emit(state, 'potwin', winners[0].id, potAwarded);
    addLog(
      state,
      winners.length > 1
        ? `${names} delen de pot van € ${potAwarded} (${bestCount} van ${QUESTIONS_PER_ROUND} goed).`
        : `${names} pakt de pot van € ${potAwarded} met ${bestCount} van ${QUESTIONS_PER_ROUND} goede antwoorden!`,
      'gold',
    );
  } else {
    emit(state, 'carry', undefined, state.pot);
    addLog(
      state,
      state.pot > 0
        ? `Niemand claimt de pot. € ${state.pot} blijft liggen voor de volgende ronde.`
        : 'De pot blijft leeg.',
      'bad',
    );
  }
}

function advanceBidder(state: GameState): void {
  for (const player of state.players) {
    if (
      !player.folded &&
      !player.hasActed &&
      player.bankroll === 0 &&
      player.bet < state.highestBet
    ) {
      player.folded = true;
      player.hasActed = true;
      addLog(state, `${player.name} kan niet meer meegaan en moet passen.`, 'bad');
    }
  }

  const start = state.currentBidder ?? state.dealer;
  const next = nextSeat(
    start,
    state.players.length,
    (index) => !state.players[index].folded && !state.players[index].hasActed,
  );
  if (next === null) {
    resolveReveal(state);
    return;
  }
  state.currentBidder = next;
  state.timeLeft = BET_SECONDS;
}

function placeBet(state: GameState, rawAmount: number): void {
  if (state.phase !== 'betting' || state.currentBidder === null) return;
  const player = state.players[state.currentBidder];
  if (!player || player.folded) return;

  const amount = Math.floor(rawAmount);
  const maxTotal = Math.min(getBetCap(state), player.bet + player.bankroll);
  if (amount <= state.highestBet || amount > maxTotal) return;

  const legalMin =
    state.highestBet === 0 ? MIN_BET : state.highestBet + BET_STEP;
  const allIn = amount === maxTotal && amount > 0;
  if (amount < legalMin && !allIn) return;

  const delta = amount - player.bet;
  if (delta <= 0) return;

  player.bankroll -= delta;
  player.bet = amount;
  state.pot += delta;
  state.highestBet = Math.max(state.highestBet, amount);

  for (const other of state.players) {
    if (other.id !== player.id && !other.folded) other.hasActed = false;
  }
  player.hasActed = true;

  emit(state, 'bet', player.id, delta);
  addLog(
    state,
    `${player.name} verhoogt met € ${delta} naar € ${player.bet}.`,
    'gold',
  );
  advanceBidder(state);
}

function callBet(state: GameState): void {
  if (state.phase !== 'betting' || state.currentBidder === null) return;
  const player = state.players[state.currentBidder];
  if (!player || player.folded) return;

  const target = Math.min(state.highestBet, player.bet + player.bankroll);
  const delta = target - player.bet;
  if (delta <= 0) return;

  player.bankroll -= delta;
  player.bet = target;
  state.pot += delta;
  player.hasActed = true;

  emit(state, 'bet', player.id, delta);
  addLog(
    state,
    `${player.name} gaat mee voor € ${delta}${target < state.highestBet ? ' (all-in)' : ''}.`,
    'gold',
  );
  advanceBidder(state);
}

function foldBet(state: GameState): void {
  if (state.phase !== 'betting' || state.currentBidder === null) return;
  const player = state.players[state.currentBidder];
  if (!player || player.folded) return;

  player.folded = true;
  player.hasActed = true;
  emit(state, 'fold', player.id);
  addLog(state, `${player.name} past.`, 'neutral');
  advanceBidder(state);
}

function startShootout(state: GameState): void {
  if (!isShootoutQuestionAvailable(state)) {
    state.phase = 'gameOver';
    state.shootout = null;
    return;
  }

  const used = new Set(state.usedQuestionIds);
  const available = state.pool.filter((question) => !used.has(question.id));
  const question =
    available.find((candidate) => candidate.difficulty === 3) ?? available[0];

  state.usedQuestionIds = [...state.usedQuestionIds, question.id];
  state.phase = 'shootout';
  state.timeLeft = 0;
  state.currentBidder = null;
  state.activeAnswerer = null;
  state.shootout = {
    question,
    stage: 'countdown',
    countdown: SHOOTOUT_COUNTDOWN,
    timeLeft: 0,
    buzzedBy: null,
    eliminated: [],
    answer: '',
    correct: null,
    winnerId: null,
    bonus: SHOOTOUT_BONUS,
    lastWrong: null,
  };
  addLog(
    state,
    'SHOOTOUT! Eerste bel, eerste antwoord. Goed is +100, fout is eruit.',
    'gold',
  );
}

function shootoutWrong(state: GameState, text: string): void {
  const shootout = state.shootout;
  if (!shootout || !shootout.buzzedBy) return;
  const playerId = shootout.buzzedBy;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return;

  if (!shootout.eliminated.includes(playerId)) {
    shootout.eliminated = [...shootout.eliminated, playerId];
  }
  shootout.answer = text;
  shootout.correct = false;
  shootout.lastWrong = { playerId, answer: text };
  shootout.buzzedBy = null;

  emit(state, 'wrong', playerId);
  addLog(
    state,
    text.trim()
      ? `${player.name} antwoordt fout met "${text.trim()}". ${player.name} ligt eruit.`
      : `${player.name} geeft geen antwoord en ligt eruit.`,
    'bad',
  );

  if (shootout.eliminated.length >= state.players.length) {
    shootout.stage = 'result';
    shootout.winnerId = null;
    shootout.timeLeft = 0;
  } else {
    shootout.stage = 'open';
    shootout.timeLeft = SHOOTOUT_REOPEN_SECONDS;
    shootout.answer = '';
  }
}

function shootoutAnswer(state: GameState, text: string): void {
  const shootout = state.shootout;
  if (!shootout || shootout.stage !== 'answering' || !shootout.buzzedBy) return;

  const answer = text.trim().slice(0, 140);
  const correct = isCorrectAnswer(shootout.question, answer);

  if (correct) {
    const player = state.players.find(
      (candidate) => candidate.id === shootout.buzzedBy,
    );
    shootout.answer = answer;
    shootout.correct = true;
    shootout.winnerId = shootout.buzzedBy;
    shootout.stage = 'result';
    shootout.timeLeft = 0;
    shootout.buzzedBy = null;
    emit(state, 'correct', player?.id);
    addLog(
      state,
      `${player?.name ?? 'Speler'} heeft het goed: ${shootout.question.answers[0]}. +€ ${shootout.bonus}!`,
      'good',
    );
  } else {
    shootoutWrong(state, answer);
  }
}

function tickShootout(state: GameState): void {
  const shootout = state.shootout;
  if (!shootout) return;

  if (shootout.stage === 'countdown') {
    shootout.countdown -= 1;
    if (shootout.countdown <= 0) {
      shootout.countdown = 0;
      shootout.stage = 'open';
      shootout.timeLeft = SHOOTOUT_OPEN_SECONDS;
    }
    return;
  }

  if (shootout.stage === 'open') {
    shootout.timeLeft -= 1;
    if (shootout.timeLeft <= 0) {
      shootout.timeLeft = 0;
      shootout.stage = 'result';
      shootout.winnerId = null;
      addLog(state, 'Niemand belde op tijd. Geen bonus deze keer.', 'bad');
    }
    return;
  }

  if (shootout.stage === 'answering') {
    shootout.timeLeft -= 1;
    if (shootout.timeLeft <= 0) {
      shootout.timeLeft = 0;
      shootoutWrong(state, '');
    }
  }
}

function finishShootout(state: GameState): void {
  if (state.phase !== 'shootout' || !state.shootout) return;
  if (state.shootout.stage !== 'result') return;

  const winner = state.shootout.winnerId
    ? state.players.find((player) => player.id === state.shootout?.winnerId)
    : undefined;
  const sweptPot = winner ? state.pot : 0;
  if (winner) {
    winner.bankroll += state.shootout.bonus + sweptPot;
    state.pot = 0;
    emit(state, 'bonus', winner.id, state.shootout.bonus + sweptPot);
    addLog(
      state,
      sweptPot > 0
        ? `${winner.name} wint de shootout: € ${state.shootout.bonus} bonus en de resterende pot van € ${sweptPot}!`
        : `${winner.name} wint de shootout en ontvangt € ${state.shootout.bonus}!`,
      'gold',
    );
  }

  state.shootoutsPlayed += 1;
  const top = Math.max(...state.players.map((player) => player.bankroll));
  const tiedLeaders = state.players.filter((player) => player.bankroll === top);

  if (
    tiedLeaders.length > 1 &&
    state.shootoutsPlayed < MAX_SHOOTOUTS &&
    isShootoutQuestionAvailable(state)
  ) {
    addLog(
      state,
      `Gelijke stand aan de top (€ ${top}). Nog een shootout voor de beslissing!`,
      'gold',
    );
    state.shootout = null;
    startShootout(state);
    return;
  }

  state.shootout = null;
  state.phase = 'gameOver';
  state.timeLeft = 0;
  addLog(state, 'Het mes is gevallen. Het spel is afgelopen!', 'gold');
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'startGame': {
      const config = {
        ...action.config,
        rounds: Math.min(
          MAX_ROUNDS,
          Math.max(3, Math.round(action.config.rounds)),
        ),
      };
      const next = createInitialState();
      next.config = config;
      next.players = createPlayers(config);
      next.pool = shufflePool(config.seed, config.deck ?? 'classic');
      next.phase = 'answering';
      // Keep the event sequence monotonic across replays so audio cues are not
      // swallowed when a new game reuses low ids.
      next.eventSeq = state.eventSeq;
      next.logSeq = state.logSeq;
      next.log = [];
      addLog(
        next,
        `Welkom bij Met het Mes op Tafel. ${config.rounds} rondes van vier vragen, één pot, ${next.players.length} spelers${config.deck === 'memes' ? ' — meme-editie' : ''}.`,
        'gold',
      );
      setupRound(next, 1);
      return next;
    }

    case 'beginAnswering': {
      if (state.phase !== 'answering' || state.answerStage !== 'preview') {
        return state;
      }
      const next = clone(state);
      beginAnswering(next);
      return next;
    }

    case 'openCurtain': {
      if (state.phase !== 'answering' || state.answerStage !== 'turn') {
        return state;
      }
      const next = clone(state);
      next.curtainOpen = true;
      return next;
    }

    case 'submitAnswers': {
      if (state.phase !== 'answering' || state.answerStage !== 'turn') {
        return state;
      }
      const next = clone(state);
      lockCurrentAnswers(next, action.answers, action.playerId);
      return next;
    }

    case 'startBetting': {
      if (state.phase !== 'answerReveal') return state;
      const next = clone(state);
      startBetting(next);
      return next;
    }

    case 'tick': {
      if (state.phase === 'answering') {
        const next = clone(state);
        if (next.timeLeft > 0) next.timeLeft -= 1;
        if (next.timeLeft <= 0) {
          if (next.answerStage === 'preview') {
            beginAnswering(next);
          } else if (isSimultaneous(next)) {
            for (const player of next.players) {
              if (!player.locked) lockAnswers(next, player, []);
            }
            startAnswerReveal(next);
          } else if (next.activeAnswerer !== null) {
            lockCurrentAnswers(next, []);
          }
        }
        return next;
      }

      if (state.phase === 'answerReveal') {
        if (state.timeLeft > 1) {
          const next = clone(state);
          next.timeLeft -= 1;
          return next;
        }
        const next = clone(state);
        next.timeLeft = 0;
        startBetting(next);
        return next;
      }

      if (state.phase === 'betting') {
        if (state.timeLeft > 1) {
          const next = clone(state);
          next.timeLeft -= 1;
          return next;
        }
        const next = clone(state);
        next.timeLeft = 0;
        foldBet(next);
        return next;
      }

      if (state.phase === 'shootout') {
        const next = clone(state);
        tickShootout(next);
        return next;
      }

      return state;
    }

    case 'placeBet': {
      if (state.phase !== 'betting') return state;
      const next = clone(state);
      placeBet(next, action.amount);
      return next;
    }

    case 'callBet': {
      if (state.phase !== 'betting') return state;
      const next = clone(state);
      callBet(next);
      return next;
    }

    case 'foldBet': {
      if (state.phase !== 'betting') return state;
      const next = clone(state);
      foldBet(next);
      return next;
    }

    case 'nextRound': {
      if (state.phase !== 'reveal' || !state.config) return state;
      const next = clone(state);
      if (!next.config) return state;
      if (next.round < next.config.rounds) {
        setupRound(next, next.round + 1);
      } else {
        startShootout(next);
      }
      return next;
    }

    case 'buzz': {
      if (state.phase !== 'shootout' || !state.shootout) return state;
      const shootout = state.shootout;
      const player = state.players.find(
        (candidate) => candidate.id === action.playerId,
      );
      if (!player || shootout.stage !== 'open') return state;
      if (shootout.eliminated.includes(player.id)) return state;

      const next = clone(state);
      const target = next.shootout;
      if (!target) return state;
      target.stage = 'answering';
      target.buzzedBy = player.id;
      target.answer = '';
      target.correct = null;
      target.timeLeft = SHOOTOUT_ANSWER_SECONDS;
      target.lastWrong = null;
      emit(next, 'buzz', player.id);
      addLog(next, `${player.name} is er als eerste bij!`, 'gold');
      return next;
    }

    case 'shootoutAnswer': {
      if (state.phase !== 'shootout' || !state.shootout) return state;
      if (state.shootout.stage !== 'answering') return state;
      const next = clone(state);
      shootoutAnswer(next, action.text);
      return next;
    }

    case 'finishShootout': {
      if (state.phase !== 'shootout' || !state.shootout) return state;
      if (state.shootout.stage !== 'result') return state;
      const next = clone(state);
      finishShootout(next);
      return next;
    }

    case 'backToMenu':
      return createInitialState();

    default:
      return state;
  }
}
