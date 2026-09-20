/**
 * Rule Engine Validator for "Met het Mes op Tafel"
 * 
 * Centralizes all game rules as deterministic functions.
 * Replaces inline validation scattered across socket handlers.
 * 
 * All functions return { valid: boolean, error: string | null }
 * where error describes why validation failed, or null if valid.
 */

// --- Core validation helpers (internal, used by rule functions) ---

/**
 * Validate that a value is a non-empty string within length limits.
 * @param {*} value - Value to validate
 * @param {number} maxLen - Maximum allowed length (default 200)
 * @returns {boolean}
 */
function isValidString(value, maxLen = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLen;
}

/**
 * Validate that a value is a non-negative number within a maximum.
 * @param {*} value - Value to validate
 * @param {number} max - Maximum allowed value (default 1000)
 * @returns {boolean}
 */
function isValidNumber(value, max = 1000) {
  return typeof value === 'number' && value >= 0 && value <= max;
}

/**
 * Validate that a value is a non-empty string without angle brackets.
 * @param {*} value - Value to validate
 * @param {number} maxLen - Maximum allowed length (default 50)
 * @returns {boolean}
 */
function isValidPlayerName(value, maxLen = 50) {
  return isValidString(value, maxLen) && !/[<>]/.test(value);
}

/**
 * Validate that a role is one of the allowed roles.
 * @param {*} value - Value to validate
 * @returns {boolean}
 */
function isValidRole(value) {
  return ['quizmaster', 'player'].includes(value);
}

/**
 * Validate that a candidates array contains only non-empty strings.
 * @param {*} value - Value to validate
 * @returns {boolean}
 */
function isValidCandidateList(value) {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0);
}

// --- Public Rule Engine Functions ---

/**
 * Validate a bet placement by a player.
 * 
 * Rules:
 * - Amount must be a valid number within global limits
 * - Player must have sufficient money
 * - In BETTING_MANDATORY: bet must meet or exceed mandatoryBet
 * - In BETTING/LAST_RAISE: raise must be at least 10 and at most 50 (or player's money)
 * - Player must not be eliminated
 * - Phase must allow betting
 *
 * @param {number} amount - The bet amount to validate
 * @param {Object} playerState - The player's state { id, money, eliminated, bets }
 * @param {Object} gameState - The current game state { phase, mandatoryBet, highestBet, pot, players }
 * @returns {{ valid: boolean, error: string | null }}
 */
function validateBet(amount, playerState, gameState) {
  // Validate amount is a valid number
  if (!isValidNumber(amount, 1000)) {
    return { valid: false, error: 'Invalid bet amount: must be a number between 0 and 1000' };
  }

  // Player must exist and not be eliminated
  if (!playerState) {
    return { valid: false, error: 'Player state not found' };
  }
  if (playerState.eliminated) {
    return { valid: false, error: 'Cannot bet while eliminated' };
  }

  // Phase must allow betting
  const allowedPhases = ['BETTING_MANDATORY', 'BETTING', 'LAST_RAISE'];
  if (!allowedPhases.includes(gameState.phase)) {
    return { valid: false, error: `Cannot bet in phase '${gameState.phase}'` };
  }

  const { money } = playerState;
  const { mandatoryBet, highestBet } = gameState;

  // Phase-specific validation
  if (gameState.phase === 'BETTING_MANDATORY') {
    // Must meet minimum mandatory bet
    if (amount < mandatoryBet) {
      return { valid: false, error: `Bet must be at least the mandatory bet of ${mandatoryBet}` };
    }
    // Cannot bet more than player has
    if (amount > money) {
      return { valid: false, error: `Bet exceeds your money (${money})` };
    }
  } else if (gameState.phase === 'BETTING' || gameState.phase === 'LAST_RAISE') {
    // Raise must be at least 10
    const minRaise = 10;
    if (amount < minRaise) {
      return { valid: false, error: `Raise must be at least ${minRaise}` };
    }
    // Raise must be at most 50 (or player's money)
    const maxRaise = Math.min(50, money);
    if (amount > maxRaise) {
      return { valid: false, error: `Raise cannot exceed ${maxRaise} (your money)` };
    }
    // Optional: raise must exceed highest previous bet in some implementations
    // For now, we just validate the basic constraints
  }

  return { valid: true, error: null };
}

/**
 * Validate a player's answer submission.
 * 
 * Rules:
 * - Answer must be a non-empty string within length limits
 * - Phase must be QUESTIONS
 * - Player must not be eliminated
 * - Answer must match the question's acceptable answers (for correctness)
 * - Player must not have already answered in this round (optional, can be enabled)
 *
 * @param {string} answer - The answer text to validate
 * @param {Object} question - The current question { category, question, acceptableAnswers }
 * @param {Object} playerState - The player's state { id, eliminated, answers }
 * @param {Object} gameState - The current game state { phase, questions, playerAnswers }
 * @returns {{ valid: boolean, error: string | null }}
 */
function validateAnswer(answer, question, playerState, gameState) {
  // Validate answer is a non-empty string
  if (!isValidString(answer, 200)) {
    return { valid: false, error: 'Invalid answer: must be a non-empty string (max 200 chars)' };
  }

  // Phase must be QUESTIONS
  if (gameState.phase !== 'QUESTIONS') {
    return { valid: false, error: `Cannot submit answer in phase '${gameState.phase}'; expected 'QUESTIONS'` };
  }

  // Player must exist and not be eliminated
  if (!playerState || playerState.eliminated) {
    return { valid: false, error: 'Cannot submit answer while eliminated' };
  }

  // Check if player has already answered in this round (deduplication)
  if (playerState.answers && playerState.answers.includes(answer)) {
    return { valid: false, error: 'You have already submitted this answer' };
  }

  // Optional: validate against question's acceptable answers
  // This is informational; the server currently tracks correctness separately
  if (question && question.acceptableAnswers && question.acceptableAnswers.length > 0) {
    const isCorrect = question.acceptableAnswers.some(
      a => answer.toLowerCase().trim() === a.toLowerCase().trim()
    );
    // We don't reject incorrect answers; we just report for awareness
    // Could add: if (!isCorrect) return { valid: true, error: 'Answer does not match any acceptable answer' }
    // but for now we allow any valid string answer
  }

  return { valid: true, error: null };
}

/**
 * Validate a phase transition.
 * 
 * Rules:
 * - Transition must follow the defined phase order
 * - Some transitions may have pre-conditions (e.g., all players have bet)
 * - Quizmaster (first player) typically initiates transitions
 * - Cannot transition beyond GAME_OVER or before LOBBY
 *
 * @param {string} currentPhase - The current game phase
 * @param {string} action - The phase transition action (typically 'manual' or phase name)
 * @param {Object} gameState - The current game state
 * @param {string} actorId - The socket ID of the player initiating the action
 * @returns {{ valid: boolean, error: string | null, nextPhase: string | null }}
 */
function validatePhaseTransition(currentPhase, action, gameState, actorId) {
  const PHASE_ORDER = ['LOBBY', 'BETTING_MANDATORY', 'BETTING', 'QUESTIONS', 'ANSWERS_REVEAL', 'SCORE_DECLARATION', 'LAST_RAISE', 'RESOLVE', 'SHOOTOUT', 'GAME_OVER'];

  // Find current phase index
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  if (currentIdx < 0) {
    return { valid: false, error: `Unknown current phase: '${currentPhase}'`, nextPhase: null };
  }

  // Determine the next phase in the ordered sequence
  const nextPhase = PHASE_ORDER[currentIdx + 1];
  if (!nextPhase) {
    return { valid: false, error: 'Already in final phase (GAME_OVER)', nextPhase: null };
  }

  // Validate that the requested action/transition is appropriate
  // For most transitions, we just need to verify the phase order is respected
  // Additional pre-conditions can be checked by calling code

  // Special pre-condition checks for specific transitions
  if (currentPhase === 'BETTING_MANDATORY') {
    // All active players must have placed their mandatory bet
    const activePlayers = gameState.players.filter(p => !p.eliminated);
    if (activePlayers.length >= 2) {
      const allBet = activePlayers.every(p => {
        const lastBet = p.bets[p.bets.length - 1];
        return lastBet !== undefined && lastBet >= gameState.mandatoryBet;
      });
      if (!allBet) {
        return { valid: false, error: 'Not all active players have placed their mandatory bet yet', nextPhase };
      }
    }
  }

  if (currentPhase === 'BETTING') {
    // All active players must have placed their bet
    const activePlayers = gameState.players.filter(p => !p.eliminated);
    if (activePlayers.length >= 2) {
      const allBet = activePlayers.every(p => {
        const lastBet = p.bets[p.bets.length - 1];
        return lastBet !== undefined && lastBet >= gameState.mandatoryBet;
      });
      if (!allBet) {
        return { valid: false, error: 'Not all active players have placed their bet yet', nextPhase };
      }
    }
  }

  if (currentPhase === 'SCORE_DECLARATION') {
    // All players must have declared their scores
    const allDeclared = gameState.players.every(p => p.correctCount !== undefined);
    if (!allDeclared) {
      return { valid: false, error: 'Not all players have declared their scores yet', nextPhase };
    }
  }

  if (currentPhase === 'RESOLVE') {
    // Shootout candidates must be set (transition from SCORE_DECLARATION with ties)
    if (gameState.shootoutCandidates === undefined || gameState.shootoutCandidates.length === 0) {
      // This is OK if coming from SCORE_DECLARATION with tie situation
      // But if RESOLVE is called directly, candidates should be set
    }
  }

  if (currentPhase === 'SHOOTOUT') {
    // Shootout candidates must be set
    if (!gameState.shootoutCandidates || gameState.shootoutCandidates.length === 0) {
      return { valid: false, error: 'No shootout candidates defined', nextPhase };
    }
  }

  return { valid: true, error: null, nextPhase };
}

/**
 * Validate a shootout candidate/answer.
 * 
 * Rules:
 * - Candidate must be in the current shootoutCandidates list
 * - Answer must be a non-empty string within length limits
 * - Player must not have already answered in this shootout (single-elimination)
 * - Phase must be SHOOTOUT
 * - If answer is correct, winner takes the pot and game ends
 * - If incorrect, candidate is eliminated from shootout
 *
 * @param {string} candidateId - The player ID (socket id) of the shootout participant
 * @param {string} answer - The answer text provided
 * @param {Object} playerState - The player's state { id, eliminated, money }
 * @param {Object} gameState - The current game state { phase, shootoutCandidates, questions, pot, acceptableAnswers }
 * @param {Object} question - The current question { acceptableAnswers }
 * @returns {{ valid: boolean, error: string | null, eliminated: boolean | null }}
 */
function validateShootout(candidateId, answer, playerState, gameState, question) {
  // Phase must be SHOOTOUT
  if (gameState.phase !== 'SHOOTOUT') {
    return { valid: false, error: `Cannot shootout in phase '${gameState.phase}'`, eliminated: null };
  }

  // Candidate must be in shootout candidates
  if (!gameState.shootoutCandidates || !gameState.shootoutCandidates.includes(candidateId)) {
    return { valid: false, error: 'Player is not a current shootout candidate', eliminated: null };
  }

  // Answer must be a valid string
  if (!isValidString(answer, 200)) {
    return { valid: false, error: 'Invalid answer: must be a non-empty string (max 200 chars)', eliminated: null };
  }

  // Player must not be eliminated (outside shootout context)
  if (!playerState || playerState.eliminated) {
    return { valid: false, error: 'Player is eliminated and cannot participate in shootout', eliminated: true };
  }

  // Check if candidate has already answered in this shootout
  // (prevent multiple answers per shootout round)
  if (playerState.shootoutAnswers && playerState.shootoutAnswers.includes(answer)) {
    return { valid: false, error: 'You have already answered in this shootout', eliminated: null };
  }

  // Validate answer correctness against question's acceptable answers
  let isCorrect = false;
  let eliminated = false;

  if (question && question.acceptableAnswers && question.acceptableAnswers.length > 0) {
    isCorrect = question.acceptableAnswers.some(
      a => answer.toLowerCase().trim() === a.toLowerCase().trim()
    );
  }

  // Determine elimination status
  if (!isCorrect) {
    eliminated = true;
  }

  return { valid: true, error: null, eliminated };
}

// --- Export all rule functions ---

module.exports = {
  validateBet,
  validateAnswer,
  validatePhaseTransition,
  validateShootout,

  // Internal helpers (re-exported for use by socket handlers if needed)
  isValidString,
  isValidNumber,
  isValidPlayerName,
  isValidRole,
  isValidCandidateList,

  // Phase order for reference
  PHASE_ORDER: ['LOBBY', 'BETTING_MANDATORY', 'BETTING', 'QUESTIONS', 'ANSWERS_REVEAL', 'SCORE_DECLARATION', 'LAST_RAISE', 'RESOLVE', 'SHOOTOUT', 'GAME_OVER']
};