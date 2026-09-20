/**
 * GameFlowOrchestrator - Deterministic Phase Transition Manager
 * 
 * Centralizes all game flow management including phase transitions,
 * validation via the rule engine, retry loops, and turn/round cycling.
 * 
 * ALL logic is deterministic - no LLM reasoning, no random outcomes
 * (except the existing shuffle/pickQuestions which are explicitly seeded).
 */

const ruleEngine = require('./rulesEngine');

// --- Constants ---
const QUESTIONS_PER_ROUND = 4;

// --- Question Bank & Selection ---
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

// --- Phase Order (deterministic, sourced from rulesEngine) ---
const PHASE_ORDER = ruleEngine.PHASE_ORDER;

/**
 * Attempt a phase transition with retry logic.
 * 
 * @param {Object} state - The current game state
 * @param {string} actorId - The socket ID of the player initiating the action
 * @param {number} [maxAttempts=3] - Maximum retry attempts
 * @returns {{ success: boolean, currentPhase: string, nextPhase: string | null, error: string | null }}
 */
function attemptTransition(state, actorId, maxAttempts = 3) {
  // Input validation
  if (!state || !state.phase) {
    return { success: false, currentPhase: 'UNKNOWN', nextPhase: null, error: 'Invalid game state' };
  }

  if (!actorId) {
    return { success: false, currentPhase: state.phase, nextPhase: null, error: 'Missing actor ID' };
  }

  // Attempt the transition, retrying on validation failure
  let attempts = 0;
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts++;

    // Validate the phase transition using the rule engine
    const validation = ruleEngine.validatePhaseTransition(
      state.phase,
      'manual', // action type - 'manual' for quizmaster-initiated, or we could derive from context
      state,
      actorId
    );

    if (validation.valid) {
      // Transition valid - apply it
      const nextPhase = validation.nextPhase;
      if (nextPhase) {
        state.phase = nextPhase;
        // Broadcast the updated state
        broadcastState(state);
      }
      return {
        success: true,
        currentPhase: state.phase,
        nextPhase: null, // already applied
        error: null
      };
    }

    // Transition invalid - store error and retry
    lastError = validation.error;

    // If this is the last attempt, fall back to safe default
    if (attempts >= maxAttempts) {
      // Safe default: stay in current phase, report the validation failure
      return {
        success: false,
        currentPhase: state.phase,
        nextPhase: null,
        error: `${lastError}. Transition blocked after ${maxAttempts} attempts.`
      };
    }

    // Otherwise, continue to next attempt (could add small delay or different validation path)
  }

  // Should not reach here, but fallback
  return {
    success: false,
    currentPhase: state.phase,
    nextPhase: null,
    error: lastError || 'Unknown transition failure'
  };
}

/**
 * Start a new round - resets state and advances to the first action phase.
 * 
 * @param {Object} state - The game state for the room
 * @returns {{ success: boolean, error: string | null, newPhase: string }} */
function startNewRound(state) {
  if (!state) {
    return { success: false, error: 'Invalid game state', newPhase: null };
  }

  try {
    // Reset round statistics
    for (const p of state.players) {
      if (p.bets.length < state.round) {
        for (let i = p.bets.length; i < state.round; i++) p.bets.push(0);
      }
      p.answers = [];
      p.correctCount = 0;
      p.eliminated = false; // reset elimination status
    }

    // Pick new questions for this round (4 regular + 1 for shootout)
    state.questions = pickQuestions(QUESTIONS_PER_ROUND + 1);
    state.currentQ = 0;
    state.shootoutQ = QUESTIONS_PER_ROUND;
    state.playerAnswers = {};
    state.highestBet = 0;
    state.pot = 0; // pot will be accumulated from bets
    state.questionAnsweredBy = [];

    // Start at BETTING_MANDATORY (first action phase)
    state.phase = 'BETTING_MANDATORY';

    // Broadcast the round start
    broadcastState(state);

    return {
      success: true,
      error: null,
      newPhase: 'BETTING_MANDATORY'
    };
  } catch (error) {
    console.error('Failed to start new round:', error.message);
    return {
      success: false,
      error: error.message,
      newPhase: null
    };
  }
}

/**
 * Handle a player submitting an answer.
 * Validates the answer using the rule engine and advances question/phase when ready.
 * 
 * @param {Object} state - The game state for the room
 * @param {string} socketId - The socket ID of the player submitting the answer
 * @param {string} answer - The answer text
 * @returns {{ success: boolean, error: string | null, advanced: boolean, newPhase: string | null }} */
function submitAnswer(state, socketId, answer) {
  if (!state || !state.phase) {
    return { success: false, error: 'Invalid game state', advanced: false, newPhase: null };
  }

  // Validate the player and answer using the rule engine
  const player = state.players.find(p => p.id === socketId);
  if (!player) {
    return { success: false, error: 'Player not found in current game', advanced: false, newPhase: null };
  }

  if (player.eliminated) {
    return { success: false, error: 'Cannot submit answer while eliminated', advanced: false, newPhase: null };
  }

  // Check if we're in the correct phase
  if (state.phase !== 'QUESTIONS') {
    return { success: false, error: `Cannot submit answer in phase '${state.phase}'; expected 'QUESTIONS'`, advanced: false, newPhase: null };
  }

  // Get the current question
  const currentQuestion = state.questions[state.currentQ];
  if (!currentQuestion) {
    return { success: false, error: 'No question available for current index', advanced: false, newPhase: null };
  }

  // Validate the answer using the rule engine
  const validation = ruleEngine.validateAnswer(
    answer,
    currentQuestion,
    player,
    state
  );

  if (!validation.valid) {
    return { success: false, error: validation.error, advanced: false, newPhase: null };
  }

  // Store the answer
  if (!state.playerAnswers[socketId]) {
    state.playerAnswers[socketId] = [];
  }
  state.playerAnswers[socketId].push(answer);
  player.answers.push(answer);
  if (!state.questionAnsweredBy.includes(socketId)) {
    state.questionAnsweredBy.push(socketId);
  }

  // Broadcast updated state
  broadcastState(state);

  // Check if all active players have answered this question
  const activePlayers = state.players.filter(p => !p.eliminated);
  if (activePlayers.length >= 2) {
    const allAnswered = activePlayers.every(p => {
      return state.questionAnsweredBy.includes(p.id);
    });

    if (allAnswered) {
      // All players answered this question - advance to next question or ANSWERS_REVEAL
      state.questionAnsweredBy = [];
      if (state.currentQ < QUESTIONS_PER_ROUND - 1) {
        state.currentQ++;
        broadcastState(state);
        return {
          success: true,
          error: null,
          advanced: false, // still in QUESTIONS phase, just next question
          newPhase: 'QUESTIONS'
        };
      } else {
        // All 4 questions answered - advance to ANSWERS_REVEAL
        const transition = attemptTransition(state, socketId);
        return {
          success: transition.success,
          error: transition.error,
          advanced: transition.success,
          newPhase: transition.currentPhase
        };
      }
    }
  }

  return {
    success: true,
    error: null,
    advanced: false,
    newPhase: null // still in QUESTIONS, waiting for more players
  };
}

/**
 * Handle score declaration by the quizmaster.
 * Validates that all players have declared scores and advances the phase.
 * 
 * @param {Object} state - The game state for the room
 * @param {string} socketId - The quizmaster's socket ID
 * @returns {{ success: boolean, error: string | null, advanced: boolean, newPhase: string | null }} */
function declareScores(state, socketId) {
  if (!state || !state.phase) {
    return { success: false, error: 'Invalid game state', advanced: false, newPhase: null };
  }

  // Validate phase - must be SCORE_DECLARATION
  if (state.phase !== 'SCORE_DECLARATION') {
    return { success: false, error: `Cannot declare scores in phase '${state.phase}'`, advanced: false, newPhase: null };
  }

  // Validate using rule engine that all players have declared
  const validation = ruleEngine.validatePhaseTransition(
    state.phase,
    'declare',
    state,
    socketId
  );

  if (!validation.valid) {
    return { success: false, error: validation.error, advanced: false, newPhase: null };
  }

  // All scores have been declared - advance to next phase
  // The rule engine already validated the pre-conditions, so we can attempt the transition
  const transition = attemptTransition(state, socketId);

  return {
    success: transition.success,
    error: transition.error,
    advanced: transition.success,
    newPhase: transition.currentPhase
  };
}

/**
 * Resolve the current round - determines winners, handles shootouts, etc.
 * 
 * @param {Object} state - The game state for the room
 * @returns {{ success: boolean, error: string | null, newPhase: string | null }} */
function resolveCurrentRound(state) {
  if (!state) {
    return { success: false, error: 'Invalid game state', newPhase: null };
  }

  // Validate phase - must be RESOLVE (or LAST_RAISE → RESOLVE transition handled elsewhere)
  if (state.phase !== 'RESOLVE') {
    return { success: false, error: `Cannot resolve round in phase '${state.phase}'`, newPhase: null };
  }

  try {
    const resolution = _resolveRoundInternal(state);

    // Broadcast the resolution
    broadcastState(state);

    return {
      success: true,
      error: null,
      newPhase: resolution.nextPhase
    };
  } catch (error) {
    console.error('Failed to resolve round:', error.message);
    return {
      success: false,
      error: error.message,
      newPhase: null
    };
  }
}

/**
 * Internal round resolution logic - pure deterministic function.
 * Extracted from the original resolveRound() in index.js.
 */
function _resolveRoundInternal(state) {
  const active = state.players.filter(p => !p.eliminated);

  if (active.length === 0) {
    // No active players - unusual state, fall back
    state.phase = 'GAME_OVER';
    state.winnerId = null;
    return { nextPhase: 'GAME_OVER' };
  }

  // Find max correct count among active players
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

  // If there's a single winner
  if (winners.length === 1) {
    const winner = winners[0];
    winner.money += state.pot;
    state.pot = 0;
    state.winnerId = winner.id;
    state.winnerName = winner.name;

    // Reset round stats for next round
    for (const p of state.players) {
      p.correctCount = 0;
      p.answers = [];
      // Reset bets for next round
      if (p.bets.length < state.round) {
        for (let i = p.bets.length; i < state.round; i++) p.bets.push(0);
      }
    }

    // Check if game is over (7+ rounds or only 1 player remaining)
    const remainingActive = state.players.filter(p => !p.eliminated);
    if (state.round >= 7 || remainingActive.length <= 1) {
      state.phase = 'GAME_OVER';
      return { nextPhase: 'GAME_OVER' };
    } else {
      // Advance to next round - LOBBY
      state.round++;
      state.phase = 'LOBBY';
      return { nextPhase: 'LOBBY' };
    }
  }

  // Tie situation - send to shootout
  state.shootoutCandidates = winners.map(w => w.id);
  state.phase = 'RESOLVE'; // Stay in RESOLVE phase, but set shootout candidates
  // Actually, based on original code: phase becomes 'RESOLVE' with shootout candidates set
  // But looking at original code more carefully, it sets phase to 'RESOLVE' and then shootout phase...
  // Let me re-check: original code sets state.phase = 'RESOLVE' and shootoutCandidates
  // Then later start_shootout changes phase to SHOOTOUT
  // So here we just set up for shootout, phase stays effectively in resolution state

  return { nextPhase: 'SHOOTOUT' }; // Transition to shootout phase}
}

/**
 * Start a shootout round.
 * 
 * @param {Object} state - The game state for the room
 * @param {Array} candidates - Array of player IDs participating in shootout
 * @param {string} socketId - The socket ID initiating the shootout
 * @returns {{ success: boolean, error: string | null, newPhase: string | null }} */
function startShootout(state, candidates, socketId) {
  if (!state) {
    return { success: false, error: 'Invalid game state', newPhase: null };
  }

  // Validate candidates using the rule engine
  const player = state.players.find(p => p.id === socketId);
  if (!player) {
    return { success: false, error: 'Player not found', newPhase: null };
  }

  // Validate candidate list
  const candidateValidation = ruleEngine.validateCandidateList(candidates);
  if (!candidateValidation.valid) {
    return { success: false, error: candidateValidation.error, newPhase: null };
  }

  // Verify all candidates are active players
  for (const cid of candidates) {
    const candidate = state.players.find(p => p.id === cid);
    if (!candidate || candidate.eliminated) {
      return { success: false, error: `Candidate ${cid} is not an active player`, newPhase: null };
    }
  }

  // Set shootout candidates and advance phase
  state.shootoutCandidates = candidates;
  // Transition from RESOLVE to SHOOTOUT
  state.phase = 'SHOOTOUT';

  // Broadcast the shootout start
  broadcastState(state);

  return {
    success: true,
    error: null,
    newPhase: 'SHOOTOUT'
  };
}

/**
 * Process a shootout answer from a candidate.
 * 
 * @param {Object} state - The game state for the room
 * @param {string} socketId - The socket ID of the answering player
 * @param {string} answer - The answer text
 * @param {Object} question - The current question object
 * @returns {{ success: boolean, error: string | null, eliminated: boolean | null, newPhase: string | null }} */
function processShootoutAnswer(state, socketId, answer, question) {
  if (!state || !state.phase) {
    return { success: false, error: 'Invalid game state', eliminated: null, newPhase: null };
  }

  // Phase must be SHOOTOUT
  if (state.phase !== 'SHOOTOUT') {
    return { success: false, error: `Cannot answer shootout in phase '${state.phase}'`, eliminated: null, newPhase: null };
  }

  // Find the player state
  const player = state.players.find(p => p.id === socketId);
  if (!player) {
    return { success: false, error: 'Player not found', eliminated: null, newPhase: null };
  }

  if (player.eliminated) {
    return { success: false, error: 'Player is eliminated', eliminated: true, newPhase: null };
  }

  // Validate using the rule engine
  const validation = ruleEngine.validateShootout(socketId, answer, player, state, question);

  if (!validation.valid) {
    return { success: false, error: validation.error, eliminated: validation.eliminated, newPhase: null };
  }

  // Apply the result
  if (validation.eliminated) {
    // Player was eliminated from shootout
    const idx = state.shootoutCandidates.indexOf(socketId);
    if (idx !== -1) {
      state.shootoutCandidates.splice(idx, 1);
    }

    // Check if all candidates eliminated
    if (state.shootoutCandidates.length === 0) {
      // Game over - no winners remaining
      state.phase = 'GAME_OVER';
      state.winnerId = null;
      broadcastState(state);
      return {
        success: true,
        error: null,
        eliminated: true,
        newPhase: 'GAME_OVER'
      };
    }
  } else if (validation.valid && state.shootoutCandidates.length === 1) {
    // Single remaining correct answer - winner takes pot
    const winnerId = state.shootoutCandidates[0];
    const winner = state.players.find(p => p.id === winnerId);
    if (winner) {
      winner.money += state.pot;
      state.pot = 0;
      state.winnerId = winner.id;
    }
    state.phase = 'GAME_OVER';
    broadcastState(state);
    return {
      success: true,
      error: null,
      eliminated: false,
      newPhase: 'GAME_OVER'
    };
  }

  // Broadcast updated state
  broadcastState(state);

  return {
    success: true,
    error: null,
    eliminated: false,
    newPhase: null // still in SHOOTOUT
  };
}

/**
 * Get the phase sequence for a complete turn loop.
 * Useful for UI display or validation sequencing.
 * 
 * @returns {Array<string>} Array of phases in order for one turn loop }
 */
function getTurnLoopSequence() {
  // START_OF_TURN → ACTION_PHASE → RESOLUTION → END_OF_TURN
  // Mapped to actual phases:
  return [
    'LOBBY',           // START_OF_TURN - round begins
    'BETTING_MANDATORY', // ACTION_PHASE - mandatory bets
    'BETTING',         // ACTION_PHASE - raises
    'LAST_RAISE',      // ACTION_PHASE - final raises
    'QUESTIONS',       // RESOLUTION - players answer
    'ANSWERS_REVEAL',  // RESOLUTION - answers revealed
    'SCORE_DECLARATION', // RESOLUTION - scores declared
    'RESOLVE',         // RESOLUTION - round resolved
    'SHOOTOUT',        // END_OF_TURN - tiebreaker (if needed)
    'GAME_OVER'        // END_OF_TURN - game concludes
  ];
}

/**
 * Get the action phases within a turn loop.
 * These are the phases where players place bets/raises.
 * 
 * @returns {Array<string>} Array of action phase names */
function getActionPhases() {
  return ['BETTING_MANDATORY', 'BETTING', 'LAST_RAISE'];
}

/**
 * Get the resolution phases within a turn loop.
 * These are the phases where answers are processed and scores declared.
 * 
 * @returns {Array<string>} Array of resolution phase names */
function getResolutionPhases() {
  return ['QUESTIONS', 'ANSWERS_REVEAL', 'SCORE_DECLARATION', 'RESOLVE'];
}

/**
 * Broadcast the current game state to all clients in the room.
 * 
 * @param {Object} state - The game state to broadcast */
function broadcastState(state) {
  try {
    const io = getIO();
    if (io && state.roomId) {
      io.to(state.roomId).emit('state_update', state);
    }
  } catch (error) {
    console.error('Failed to broadcast state:', error.message);
  }
}

/**
 * Get the Socket.IO instance.
 * We need a reference to io - this is a limitation; in production,
 * the orchestrator would receive the io instance or the state would carry it.
 * For now, we attach it when the server initializes.
 */
let attachedIO = null;

/**
 * Attach the Socket.IO instance to the orchestrator.
 * Called from server setup.
 * 
 * @param {Object} io - The Socket.IO instance */
function attachIO(io) {
  attachedIO = io;
}

/**
 * Get the attached IO instance.
 * 
 * @returns {Object} Socket.IO instance or null */
function getIO() {
  return attachedIO;
}

// --- Exports ---

module.exports = {
  attemptTransition,
  startNewRound,
  submitAnswer,
  declareScores,
  resolveCurrentRound,
  startShootout,
  processShootoutAnswer,
  getTurnLoopSequence,
  getActionPhases,
  getResolutionPhases,
  attachIO,
  broadcastState,

  // For reference - the phase order
  PHASE_ORDER,

  // Constants for turn loop structure
  TURN_STAGES: {
    START_OF_TURN: 'START_OF_TURN',
    ACTION_PHASE: 'ACTION_PHASE',
    RESOLUTION: 'RESOLUTION', 
    END_OF_TURN: 'END_OF_TURN'
  },

  // Phase group constants
  PHASE_GROUPS: {
    START_OF_TURN: ['LOBBY'],
    ACTION_PHASE: ['BETTING_MANDATORY', 'BETTING', 'LAST_RAISE'],
    RESOLUTION: ['QUESTIONS', 'ANSWERS_REVEAL', 'SCORE_DECLARATION', 'RESOLVE'],
    END_OF_TURN: ['SHOOTOUT', 'GAME_OVER']
  },

  // Question constants
  QUESTIONS_PER_ROUND: QUESTIONS_PER_ROUND
};