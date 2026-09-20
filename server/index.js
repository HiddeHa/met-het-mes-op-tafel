const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// Improved CORS configuration - restrict to specific origins in production
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://yourdomain.com'] // Replace with your actual domain
  : ['http://localhost:5173', 'http://127.0.0.1:5173']; // Allow local development

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // Allow all origins in development, or specific origins in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment) {
      return callback(null, true);
    }
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json({
  limit: '10kb' // Limit JSON body size to prevent DoS attacks
}));

// --- Input Validation Helpers ---
function validateRoomId(roomId) {
  return typeof roomId === 'string' && roomId.length > 0 && roomId.length <= 50;
}

function validatePlayerName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 50 && !/[<>]/.test(name);
}

function validateRole(role) {
  return ['quizmaster', 'player'].includes(role);
}

function validateAmount(amount) {
  return typeof amount === 'number' && amount >= 0 && amount <= 1000; // Reasonable max bet
}

function validateAnswer(answer) {
  return typeof answer === 'string' && answer.length > 0 && answer.length <= 200;
}

function validateCandidateList(candidates) {
  return Array.isArray(candidates) && candidates.every(id => typeof id === 'string' && id.length > 0);
}

app.get('/', (req, res) => {
  res.send('Met het Mes op Tafel server is running. Connect your client to http://localhost:5173');
});

// --- Question bank ---
const QUESTION_BANK = [
  { category: "Films", question: "Noem de titel van de filmserie met een Teenage Mutant Ninja Turtles", acceptableAnswers: ["Teenage Mutant Ninja Turtles"] },
  { category: "Muziek", question: "Wie zingt de tekst: 'Money money money, altijd moet ik geld betalen'?", acceptableAnswers: ["ABBA"] },
  { category: "Geografie", question: "In welk land vind je de stad Santiago de Compostela?", acceptableAnswers: ["Spanje"] },
  { category: "Geschiedenis", question: "In welk jaar viel de Berlijnse Muur?", acceptableAnswers: ["1989"] },
  { category: "Wetenschap", question: "Wie ontdekte de zwaartekracht?", acceptableAnswers: ["Newton", "Isaac Newton"] },
  { category: "Eten en drinken", question: "Van welke plant komt suiker voornamelijk?", acceptableAnswers: ["suikerriet", "riet", "suikerbiet", "biet"] },
  { category: "Sport", question: "Hoe heten de hobbels op een schaatsbaan in het Fries?", acceptableAnswers: ["kupers"] },
  { category: "Taal", question: "Wat is een synoniem van het woord 'onverzonnen'?", acceptableAnswers: ["echt", "waar", "waarheid", "authentiek"] },
  { category: "Reizen", question: "Naar welk eiland in de Stille Oceaan reizen de meeste toeristen?", acceptableAnswers: ["Bali", "Java", "Hawaii"] },
  { category: "Kunst", question: "Van wie is het schilderij 'De Jordaansche boer'?", acceptableAnswers: ["Vincent van Gogh", "Van Gogh", "Vincent"] },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions(count) {
  return shuffle(QUESTION_BANK).slice(0, count);
}

// --- Persistence Setup ---
const STORAGE_DIR = path.join(__dirname, 'storage');
const GAME_STATE_FILE = path.join(STORAGE_DIR, 'game_states.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Load saved game states on startup
let rooms = new Map();
let saveTimeout = null;
function loadGameStates() {
  try {
    if (fs.existsSync(GAME_STATE_FILE)) {
      const data = fs.readFileSync(GAME_STATE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // Convert plain objects back to proper Map structure
      rooms = new Map(Object.entries(parsed));
      console.log(`Loaded ${rooms.size} game state(s) from storage`);
    }
  } catch (error) {
    console.error('Failed to load game states:', error.message);
    rooms = new Map(); // Start fresh if load fails
  }
}

// Save game states periodically
function saveGameStates() {
  try {
    // Convert Map to plain object for JSON serialization
    const plainObject = Object.fromEntries(rooms);
    fs.writeFileSync(GAME_STATE_FILE, JSON.stringify(plainObject, null, 2));
    console.log(`Saved ${rooms.size} game state(s) to storage`);
  } catch (error) {
    console.error('Failed to save game states:', error.message);
  }
}

// Load states on startup
loadGameStates();

// Save every 30 seconds
setInterval(saveGameStates, 30000);

// Also save before shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveGameStates();
  }
  process.exit(0);
});

// --- Room state ---
function createRoomState(roomId) {
  return {
    roomId,
    round: 1,
    phase: 'LOBBY',
    pot: 0,
    players: [],
    questions: [],
    currentQ: 0,
    shootoutQ: 1,
    mandatoryBet: 10,
    highestBet: 0,
    firstPlayerId: null,
    winnerId: null,
    playerAnswers: {},
    shootoutCandidates: [],
    questionAnsweredBy: [],
    phaseEndsAt: null,
  };
}

function getPlayer(state, socketId) {
  return state.players.find(p => p.id === socketId);
}

function findState(socketId) {
  for (const s of rooms.values()) {
    if (s.players.some(p => p.id === socketId)) return s;
  }
  return null;
}

// --- Automatic phase timers ---
const QUESTIONS_PER_ROUND = 4; // 4 regular questions, 1 extra reserved for the shootout
const PHASE_DURATIONS = {
  BETTING_MANDATORY: 25, // 20-30s to place the mandatory bet
  BETTING: 25,           // 20-30s to raise or pass
  QUESTIONS: 75,         // 60-90s to answer each question
  ANSWERS_REVEAL: 20,
  SCORE_DECLARATION: 30,
  LAST_RAISE: 25,
  RESOLVE: 20,
  SHOOTOUT: 45,
};
const phaseTimers = new Map();   // roomId -> timeout handle
const lastPhaseKey = new Map();  // roomId -> 'PHASE' or 'QUESTIONS:<qIndex>'

function phaseKey(state) {
  return state.phase === 'QUESTIONS' ? `${state.phase}:${state.currentQ}` : state.phase;
}

function clearPhaseTimer(roomId) {
  const t = phaseTimers.get(roomId);
  if (t) {
    clearTimeout(t);
    phaseTimers.delete(roomId);
  }
}

function scheduleAutoAdvance(state) {
  clearPhaseTimer(state.roomId);
  if (state.phase === 'GAME_OVER' || state.phase === 'LOBBY') {
    state.phaseEndsAt = null;
    return;
  }
  const seconds = PHASE_DURATIONS[state.phase];
  if (!seconds) {
    state.phaseEndsAt = null;
    return;
  }
  state.phaseEndsAt = Date.now() + seconds * 1000;
  const key = phaseKey(state);
  const timer = setTimeout(() => {
    phaseTimers.delete(state.roomId);
    const s = rooms.get(state.roomId);
    if (!s || phaseKey(s) !== key) return; // phase already moved on
    console.log(`[timer] ${s.roomId} ${s.phase} timed out - auto-advancing`);
    autoResolvePhase(s);
  }, seconds * 1000);
  phaseTimers.set(state.roomId, timer);
}

function broadcastState(state) {
  try {
    // Start/reset the phase timer whenever the phase (or current question) changes
    const key = phaseKey(state);
    if (lastPhaseKey.get(state.roomId) !== key) {
      lastPhaseKey.set(state.roomId, key);
      scheduleAutoAdvance(state);
    }
    io.to(state.roomId).emit('state_update', state);
    // Debounce saveGameStates
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveGameStates();
    }, 1000); // 1 second debounce
  } catch (error) {
    console.error('Failed to broadcast state:', error.message);
  }
}

// --- Phase transition table ---
const PHASE_ORDER = ['LOBBY', 'BETTING_MANDATORY', 'BETTING', 'QUESTIONS', 'ANSWERS_REVEAL', 'SCORE_DECLARATION', 'LAST_RAISE', 'RESOLVE', 'SHOOTOUT', 'GAME_OVER'];

function nextPhase(phase) {
  const idx = PHASE_ORDER.indexOf(phase);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1];
}

function advancePhase(state, nextPhase) {
  try {
    state.phase = nextPhase;
    broadcastState(state);
  } catch (error) {
    console.error('Failed to advance phase:', error.message);
  }
}

// Move to the next question inside the QUESTIONS phase, or on to the reveal
function advanceQuestion(state) {
  state.questionAnsweredBy = [];
  if (state.currentQ < QUESTIONS_PER_ROUND - 1) {
    state.currentQ++;
    broadcastState(state); // phaseKey changes -> timer restarts for the new question
  } else {
    advancePhase(state, 'ANSWERS_REVEAL');
  }
}

// Auto-resolve a phase whose timer expired
function autoResolvePhase(state) {
  try {
    switch (state.phase) {
      case 'BETTING_MANDATORY':
        // Anyone who did not bet in time is charged the mandatory bet
        for (const p of state.players.filter(x => !x.eliminated)) {
          const bet = p.bets[p.bets.length - 1];
          if (bet === undefined || bet < state.mandatoryBet) {
            const amt = Math.min(state.mandatoryBet, p.money);
            if (amt > 0) {
              p.money -= amt;
              state.pot += amt;
              state.highestBet = Math.max(state.highestBet, amt);
              p.bets.push(amt);
            }
          }
        }
        advancePhase(state, 'BETTING');
        break;
      case 'BETTING':
        advancePhase(state, 'QUESTIONS');
        break;
      case 'QUESTIONS':
        advanceQuestion(state);
        break;
      case 'ANSWERS_REVEAL':
        advancePhase(state, 'SCORE_DECLARATION');
        break;
      case 'SCORE_DECLARATION':
        // Undeclared scores default to 0
        for (const p of state.players.filter(x => !x.eliminated)) {
          if (typeof p.correctCount !== 'number') p.correctCount = 0;
        }
        advancePhase(state, 'LAST_RAISE');
        break;
      case 'LAST_RAISE':
        resolveRound(state);
        break;
      case 'RESOLVE':
        if (state.shootoutCandidates.length >= 2) {
          state.phase = 'SHOOTOUT';
          broadcastState(state);
        } else {
          resolveRound(state);
        }
        break;
      case 'SHOOTOUT':
        // Nobody answered in time - award the pot to the first candidate so play continues
        finishRound(state, state.shootoutCandidates[0], 'shootout timed out');
        break;
      default:
        break;
    }
  } catch (error) {
    console.error('Failed to auto-resolve phase:', error.message);
  }
}

// Award the pot and move on to the next round (or end the game)
function finishRound(state, winnerId, reason) {
  const winner = winnerId ? state.players.find(p => p.id === winnerId) : null;
  if (winner) {
    winner.money += state.pot;
    state.winnerId = winner.id;
    console.log(`[round] ${state.roomId} round ${state.round} won by ${winner.name} (${reason}) - pot EUR${state.pot}`);
  } else {
    console.log(`[round] ${state.roomId} round ${state.round} ended with no winner (${reason})`);
  }
  state.pot = 0;
  state.shootoutCandidates = [];
  state.questionAnsweredBy = [];
  resetRoundStats(state);
  const active = state.players.filter(p => !p.eliminated);
  if (state.round >= 7 || active.length <= 1) {
    state.phase = 'GAME_OVER';
  } else {
    state.round++;
    state.phase = 'LOBBY';
  }
  broadcastState(state);
}

function startRound(state) {
  try {
    // 4 regular questions + 1 extra reserved for a shootout
    state.questions = pickQuestions(QUESTIONS_PER_ROUND + 1);
    state.currentQ = 0;
    state.shootoutQ = QUESTIONS_PER_ROUND;
    state.questionAnsweredBy = [];
    state.playerAnswers = {};
    state.highestBet = 0;
    state.phase = 'BETTING_MANDATORY';
    broadcastState(state);
  } catch (error) {
    console.error('Failed to start round:', error.message);
  }
}

function autoAdvanceIfReady(state) {
  try {
    const active = state.players.filter(p => !p.eliminated);
    if (state.phase === 'BETTING_MANDATORY') {
      const allBet = active.every(p => {
        const bet = p.bets[p.bets.length - 1];
        return bet !== undefined && bet >= state.mandatoryBet;
      });
      if (allBet && active.length >= 2) {
        setTimeout(() => {
          const s = rooms.get(state.roomId);
          if (s && s.phase === 'BETTING_MANDATORY') {
            advancePhase(s, 'BETTING');
          }
        }, 1500);
      }
    }
    if (state.phase === 'BETTING') {
      const allDone = active.every(p => {
        const bet = p.bets[p.bets.length - 1];
        return bet !== undefined && bet >= state.mandatoryBet;
      });
      if (allDone && active.length >= 2) {
        setTimeout(() => {
          const s = rooms.get(state.roomId);
          if (s && s.phase === 'BETTING') {
            advancePhase(s, 'QUESTIONS');
          }
        }, 1500);
      }
    }
  } catch (error) {
    console.error('Failed in autoAdvanceIfReady:', error.message);
  }
}

function checkElimination(state) {
  try {
    const active = state.players.filter(p => !p.eliminated);
    if (active.length <= 1) {
      state.winnerId = active[0]?.id || null;
      state.phase = 'GAME_OVER';
      broadcastState(state);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Failed to check elimination:', error.message);
    return false;
  }
}

function resetRoundStats(state) {
  try {
    for (const p of state.players) {
      if (p.bets.length < state.round) {
        for (let i = p.bets.length; i < state.round; i++) p.bets.push(0);
      }
      p.answers = [];
      p.correctCount = 0;
    }
  } catch (error) {
    console.error('Failed to reset round stats:', error.message);
  }
}

function resolveRound(state) {
  try {
    const active = state.players.filter(p => !p.eliminated);
    let maxCorrect = -1;
    let winners = [];
    for (const p of active) {
      if (p.correctCount > maxCorrect) {
        maxCorrect = p.correctCount;
        winners = [p];
      } else if (p.correctCount === maxCorrect) {
        winners.push(p);
      }
    }

    if (winners.length === 1) {
      finishRound(state, winners[0].id, 'most correct answers');
    } else {
      state.shootoutCandidates = winners.map(w => w.id);
      state.phase = 'RESOLVE';
      broadcastState(state);
    }
  } catch (error) {
    console.error('Failed to resolve round:', error.message);
  }
}

// --- Socket.IO setup ---
const orchestrator = require('./gameFlowOrchestrator');
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
orchestrator.attachIO(io);

io.on('connection', (socket) => {
  try {
    console.log('New client connected', socket.id);

    // --- Join / Create Room ---
    socket.on('join_room', ({ roomId, name, role }) => {
      try {
        console.log('Join room request:', { roomId, name, role });
        
        // Input validation
        if (!validateRoomId(roomId)) {
          console.log('Invalid roomId:', roomId);
          socket.emit('error', { message: 'Invalid room ID' });
          return;
        }
        
        if (!validatePlayerName(name)) {
          console.log('Invalid player name:', name);
          socket.emit('error', { message: 'Invalid player name' });
          return;
        }
        
        if (!validateRole(role)) {
          console.log('Invalid role:', role);
          socket.emit('error', { message: 'Invalid role' });
          return;
        }

        let state = rooms.get(roomId);
        if (!state) {
          state = createRoomState(roomId);
          rooms.set(roomId, state);
          console.log('Created new room:', roomId);
        }
        socket.join(roomId);
        const existing = state.players.find(p => p.id === socket.id);
        if (!existing) {
          state.players.push({
            id: socket.id,
            name: name || `Speler ${state.players.length + 1}`,
            money: 100,
            eliminated: false,
            bets: [],
            answers: [],
            correctCount: 0,
          });
          if (!state.firstPlayerId) state.firstPlayerId = socket.id;
          console.log('Added player to room:', state.players.length);
        }
        broadcastState(state);
      } catch (error) {
        console.error('Error in join_room:', error.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // --- Start Game ---
    socket.on('start_game', () => {
      try {
        console.log('Start game request');
        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for start_game');
          return;
        }
        if (state.phase !== 'LOBBY') {
          console.log('Cannot start game, phase is:', state.phase);
          return;
        }
        const activePlayers = state.players.filter(p => !p.eliminated);
        if (activePlayers.length < 1) {
          console.log('Not enough players to start game');
          return;
        }
        state.pot = 0;
        startRound(state);
      } catch (error) {
        console.error('Error in start_game:', error.message);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // --- Phase Advance (Quizmaster manual) ---
    socket.on('phase_advance', () => {
      try {
        console.log('Phase advance request');
        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for phase_advance');
          return;
        }
        const next = nextPhase(state.phase);
        if (!next) {
          console.log('No next phase available');
          return;
        }

        // During QUESTIONS, "next" means: go to the next question (4 per round)
        if (state.phase === 'QUESTIONS') {
          advanceQuestion(state);
          return;
        }

        if (state.phase === 'BETTING_MANDATORY') {
          const player = getPlayer(state, socket.id);
          if (player) {
            const bet = Math.max(state.mandatoryBet, Math.min(50, player.money));
            if (bet >= 10) {
              player.money -= bet;
              state.pot += bet;
              state.highestBet = Math.max(state.highestBet, bet);
              player.bets.push(bet);
            }
          }
        }
        if (state.phase === 'BETTING') {
          const player = getPlayer(state, socket.id);
          if (player) {
            const raise = Math.max(10, Math.min(50, player.money));
            if (raise >= 10) {
              player.money -= raise;
              state.pot += raise;
              state.highestBet += raise;
              player.bets.push(raise);
            }
          }
        }
        if (state.phase === 'ANSWERS_REVEAL') {
          // Just advance - no special logic
        }
        advancePhase(state, next);
      } catch (error) {
        console.error('Error in phase_advance:', error.message);
        socket.emit('error', { message: 'Failed to advance phase' });
      }
    });

    // --- Reveal Answers ---
    socket.on('reveal_answers', () => {
      try {
        console.log('Reveal answers request');
        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for reveal_answers');
          return;
        }
        if (state.phase !== 'QUESTIONS' && state.phase !== 'ANSWERS_REVEAL') {
          console.log('Cannot reveal answers, phase is:', state.phase);
          return;
        }
        advancePhase(state, 'SCORE_DECLARATION');
      } catch (error) {
        console.error('Error in reveal_answers:', error.message);
        socket.emit('error', { message: 'Failed to reveal answers' });
      }
    });

    // --- Player Bets ---
    socket.on('player_bet', (amount) => {
      try {
        console.log('Player bet request:', amount);
        
        // Input validation
        if (!validateAmount(amount)) {
          console.log('Invalid bet amount:', amount);
          socket.emit('error', { message: 'Invalid bet amount' });
          return;
        }

        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for player_bet');
          return;
        }
        if (state.phase !== 'BETTING_MANDATORY' && state.phase !== 'BETTING' && state.phase !== 'LAST_RAISE') {
          console.log('Cannot bet, phase is:', state.phase);
          return;
        }

        const player = getPlayer(state, socket.id);
        if (!player || player.eliminated) {
          console.log('Player not found or eliminated for bet');
          return;
        }

        if (state.phase === 'BETTING_MANDATORY') {
          if (amount < state.mandatoryBet || amount > player.money) {
            console.log('Invalid bet amount:', amount);
            return;
          }
          player.money -= amount;
          state.pot += amount;
          state.highestBet = Math.max(state.highestBet, amount);
          player.bets.push(amount);
        } else if (state.phase === 'BETTING') {
          const raise = Math.min(50, Math.max(10, amount));
          if (raise > player.money) {
            console.log('Invalid raise amount:', raise);
            return;
          }
          player.money -= raise;
          state.pot += raise;
          state.highestBet += raise;
          player.bets.push(raise);
        } else if (state.phase === 'LAST_RAISE') {
          const raise = Math.min(50, Math.max(10, amount));
          if (raise > player.money) {
            console.log('Invalid last raise amount:', raise);
            return;
          }
          player.money -= raise;
          state.pot += raise;
          state.highestBet += raise;
          player.bets.push(raise);
        }

        broadcastState(state);

        if (state.phase === 'BETTING_MANDATORY') {
          autoAdvanceIfReady(state);
        }
        if (state.phase === 'BETTING') {
          autoAdvanceIfReady(state);
        }
      } catch (error) {
        console.error('Error in player_bet:', error.message);
        socket.emit('error', { message: 'Failed to place bet' });
      }
    });

    // --- Player Pass ---
    socket.on('player_pass', () => {
      try {
        console.log('Player pass request');
        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for player_pass');
          return;
        }
        const player = getPlayer(state, socket.id);
        if (!player || player.eliminated) {
          console.log('Player not found or eliminated for pass');
          return;
        }
        if (state.phase !== 'BETTING' && state.phase !== 'LAST_RAISE') {
          console.log('Cannot pass, phase is:', state.phase);
          return;
        }

        player.eliminated = true;
        player.bets.push(0);
        broadcastState(state);
        checkElimination(state);
      } catch (error) {
        console.error('Error in player_pass:', error.message);
        socket.emit('error', { message: 'Failed to pass' });
      }
    });

    // --- Player Submit Answer ---
    socket.on('player_submit_answer', (answer) => {
      try {
        console.log('Player submit answer request:', answer);
        
        // Input validation
        if (!validateAnswer(answer)) {
          console.log('Invalid answer:', answer);
          socket.emit('error', { message: 'Invalid answer' });
          return;
        }

        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for player_submit_answer');
          return;
        }
        if (state.phase !== 'QUESTIONS') {
          console.log('Cannot submit answer, phase is:', state.phase);
          return;
        }

        const player = getPlayer(state, socket.id);
        if (!player || player.eliminated) {
          console.log('Player not found or eliminated for answer');
          return;
        }

        if (!state.playerAnswers[player.id]) state.playerAnswers[player.id] = [];
        state.playerAnswers[player.id].push(answer);
        player.answers.push(answer);
        if (!state.questionAnsweredBy.includes(player.id)) {
          state.questionAnsweredBy.push(player.id);
        }
        broadcastState(state);

        // If every active player has answered this question, move on early
        const active = state.players.filter(p => !p.eliminated);
        const answered = active.filter(p => state.questionAnsweredBy.includes(p.id)).length;
        if (active.length >= 2 && answered >= active.length) {
          const qIndex = state.currentQ;
          setTimeout(() => {
            const s = rooms.get(state.roomId);
            if (s && s.phase === 'QUESTIONS' && s.currentQ === qIndex) {
              advanceQuestion(s);
            }
          }, 1500);
        }
      } catch (error) {
        console.error('Error in player_submit_answer:', error.message);
        socket.emit('error', { message: 'Failed to submit answer' });
      }
    });

    // --- Declare Score ---
    socket.on('declare_score', ({ playerId, count }) => {
      try {
        console.log('Declare score request:', { playerId, count });
        
        // Input validation
        if (!playerId || typeof playerId !== 'string' || playerId.length === 0) {
          console.log('Invalid playerId:', playerId);
          socket.emit('error', { message: 'Invalid player ID' });
          return;
        }
        
        if (!Number.isInteger(count) || count < 0 || count > 4) { // Max 4 correct answers per round
          console.log('Invalid score count:', count);
          socket.emit('error', { message: 'Invalid score count' });
          return;
        }

        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for declare_score');
          return;
        }
        if (state.phase !== 'SCORE_DECLARATION') {
          console.log('Cannot declare score, phase is:', state.phase);
          return;
        }

        const player = state.players.find(p => p.id === playerId);
        if (player) {
          player.correctCount = count;
        }
        broadcastState(state);

        // All scores declared? Advance to LAST_RAISE
        if (state.players.every(p => p.correctCount !== undefined || p.eliminated)) {
          setTimeout(() => {
            const s = rooms.get(state.roomId);
            if (s && s.phase === 'SCORE_DECLARATION') {
              advancePhase(s, 'LAST_RAISE');
            }
          }, 1500);
        }
      } catch (error) {
        console.error('Error in declare_score:', error.message);
        socket.emit('error', { message: 'Failed to declare score' });
      }
    });

    // --- Resolve Round from LAST_RAISE ---
    socket.on('resolve_round', () => {
      try {
        console.log('Resolve round request');
        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for resolve_round');
          return;
        }
        if (state.phase !== 'LAST_RAISE') {
          console.log('Cannot resolve round, phase is:', state.phase);
          return;
        }
        resolveRound(state);
      } catch (error) {
        console.error('Error in resolve_round:', error.message);
        socket.emit('error', { message: 'Failed to resolve round' });
      }
    });

    // --- Start Shootout ---
    socket.on('start_shootout', (candidates) => {
      try {
        console.log('Start shootout request:', candidates);
        
        // Input validation
        if (!validateCandidateList(candidates)) {
          console.log('Invalid candidates list:', candidates);
          socket.emit('error', { message: 'Invalid candidates list' });
          return;
        }

        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for start_shootout');
          return;
        }
        if (state.phase !== 'RESOLVE') {
          console.log('Cannot start shootout, phase is:', state.phase);
          return;
        }
        state.shootoutCandidates = candidates;
        state.phase = 'SHOOTOUT';
        broadcastState(state);
      } catch (error) {
        console.error('Error in start_shootout:', error.message);
        socket.emit('error', { message: 'Failed to start shootout' });
      }
    });

    // --- Shootout Answer ---
    socket.on('shootout_answer', (answer) => {
      try {
        console.log('Shootout answer request:', answer);
        
        // Input validation
        if (!validateAnswer(answer)) {
          console.log('Invalid answer:', answer);
          socket.emit('error', { message: 'Invalid answer' });
          return;
        }

        const state = findState(socket.id);
        if (!state) {
          console.log('No state found for shootout_answer');
          return;
        }
        if (state.phase !== 'SHOOTOUT') {
          console.log('Cannot answer shootout, phase is:', state.phase);
          return;
        }
        if (!state.shootoutCandidates.includes(socket.id)) {
          console.log('Player not in shootout candidates');
          return;
        }

        const q = state.questions[state.shootoutQ];
        if (!q) {
          console.log('No question found for shootout');
          return;
        }
        const isCorrect = q.acceptableAnswers.some(a =>
          answer.toLowerCase().trim() === a.toLowerCase().trim()
        );
        if (isCorrect) {
          const player = getPlayer(state, socket.id);
          finishRound(state, player ? player.id : null, 'won the shootout');
        } else {
          const idx = state.shootoutCandidates.indexOf(socket.id);
          if (idx !== -1) state.shootoutCandidates.splice(idx, 1);
          if (state.shootoutCandidates.length === 0) {
            // Everyone answered wrong - end the round with no winner
            finishRound(state, null, 'no correct shootout answer');
          } else {
            broadcastState(state);
          }
        }
      } catch (error) {
        console.error('Error in shootout_answer:', error.message);
        socket.emit('error', { message: 'Failed to process shootout answer' });
      }
    });

    // --- Cleanup ---
    socket.on('disconnect', () => {
      try {
        console.log('Client disconnected', socket.id);
        for (const [roomId, state] of rooms.entries()) {
          const idx = state.players.findIndex(p => p.id === socket.id);
          if (idx !== -1) {
            state.players.splice(idx, 1);
            if (state.firstPlayerId === socket.id) {
              state.firstPlayerId = state.players[0]?.id || null;
            }
            broadcastState(state);
          }
        }
      } catch (error) {
        console.error('Error in disconnect handler:', error.message);
      }
    });
  } catch (error) {
    console.error('Error in connection handler:', error.message);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
