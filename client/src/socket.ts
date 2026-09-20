import { io } from 'socket.io-client';
import { GameState } from './types';

const SOCKET_URL = 'http://localhost:5000';

let socketInstance: ReturnType<typeof io> | null = null;

export function getSocket() {
  if (!socketInstance) {
    console.log('[socket] Connecting to', SOCKET_URL);
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      timeout: 10000,
    });

    socketInstance.on('connect_error', (err) => {
      console.error('[socket] connect_error:', err);
    });

    socketInstance.on('connect', () => {
      console.log('[socket] Connected to', SOCKET_URL);
    });

    socketInstance.on('state_update', (state: GameState) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[socket] state_update received for room:', state?.roomId);
      }
    });
  }
  return socketInstance;
}

export function createRoom(name: string, callback: (roomId: string) => void): void {
  const s = getSocket();
  console.log('[socket] createRoom called');
  s.once('state_update', (state: GameState) => {
    console.log('[socket] createRoom state_update received:', state?.roomId);
    callback(state.roomId);
  });
  console.log('[socket] emit join_room for', name);
  s.emit('join_room', { roomId: `room_${Date.now()}`, name, role: 'quizmaster' });
}

export function joinRoom(roomId: string, name: string, callback: (state: GameState) => void): void {
  const s = getSocket();
  console.log('[socket] joinRoom called');
  s.once('state_update', (state: GameState) => {
    console.log('[socket] joinRoom state_update:', state.roomId);
    callback(state);
  });
  console.log('[socket] emit join_room for', name, 'room', roomId);
  s.emit('join_room', { roomId, name, role: 'player' });
}

const stateUpdateCallbacks = new Set<(state: GameState) => void>();

export function onStateUpdate(callback: (state: GameState) => void): void {
  stateUpdateCallbacks.add(callback);
  const s = getSocket();
  s.on('state_update', callback);
}

export function offStateUpdate(callback: (state: GameState) => void): void {
  stateUpdateCallbacks.delete(callback);
  const s = getSocket();
  s.off('state_update', callback);
}

export function startGame(): void {
  const s = getSocket();
  s.emit('start_game');
}

export function phaseAdvance(): void {
  const s = getSocket();
  s.emit('phase_advance');
}

export function revealAnswers(): void {
  const s = getSocket();
  s.emit('reveal_answers');
}

export function declareScore(data: { playerId: string; count: number }): void {
  const s = getSocket();
  s.emit('declare_score', data);
}

export function resolveRound(): void {
  const s = getSocket();
  s.emit('resolve_round');
}

export function startShootout(candidates: string[]): void {
  const s = getSocket();
  s.emit('start_shootout', candidates);
}

export function playerBet(amount: number): void {
  const s = getSocket();
  s.emit('player_bet', amount);
}

export function playerPass(): void {
  const s = getSocket();
  s.emit('player_pass');
}

export function playerSubmitAnswer(answer: string): void {
  const s = getSocket();
  s.emit('player_submit_answer', answer);
}

export function shootoutAnswer(answer: string): void {
  const s = getSocket();
  s.emit('shootout_answer', answer);
}