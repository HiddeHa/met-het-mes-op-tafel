// Simple localStorage abstraction for game persistence
export const STORAGE_KEYS = {
  gameMode: 'mhmoT_game_mode',
  quizmasterName: 'mhmoT_quizmaster_name',
  playerName: 'mhmoT_player_name',
  lastRoomId: 'mhmoT_last_room_id',
} as const;

export function getStoredMode(): 'quizmaster' | 'player' | null {
  const val = localStorage.getItem(STORAGE_KEYS.gameMode);
  if (val === 'quizmaster' || val === 'player') return val;
  return null;
}

export function setStoredMode(mode: 'quizmaster' | 'player') {
  localStorage.setItem(STORAGE_KEYS.gameMode, mode);
}

export function getStoredQuizmasterName(): string | null {
  return localStorage.getItem(STORAGE_KEYS.quizmasterName);
}

export function setStoredQuizmasterName(name: string) {
  localStorage.setItem(STORAGE_KEYS.quizmasterName, name);
}

export function getStoredPlayerName(): string | null {
  return localStorage.getItem(STORAGE_KEYS.playerName);
}

export function setStoredPlayerName(name: string) {
  localStorage.setItem(STORAGE_KEYS.playerName, name);
}

export function getStoredRoomId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.lastRoomId);
}

export function setStoredRoomId(roomId: string) {
  localStorage.setItem(STORAGE_KEYS.lastRoomId, roomId);
}
