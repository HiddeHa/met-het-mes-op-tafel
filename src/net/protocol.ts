import type { GameAction, GameState, QuestionDeck } from '../game/types';

export const MIN_ROOM_PLAYERS = 2;
export const MAX_ROOM_PLAYERS = 3;
export const ROOM_CODE_LENGTH = 5;
export const MAX_NAME_LENGTH = 18;

export interface RoomPlayerView {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  isHost: boolean;
}

export interface RoomView {
  code: string;
  hostId: string;
  players: RoomPlayerView[];
  deck: QuestionDeck;
  rounds: number;
  started: boolean;
  minPlayers: number;
  maxPlayers: number;
  /** LAN address of the game server, so a host on localhost can share a reachable link. */
  lanHost: string | null;
}

export interface OnlineGameMeta {
  roomCode: string;
  youId: string;
  roomYouId: string;
  isHost: boolean;
  connected: boolean;
}

export type ClientMessage =
  | {
      type: 'createRoom';
      name: string;
      rounds: number;
      deck: QuestionDeck;
    }
  | { type: 'joinRoom'; code: string; name: string }
  | { type: 'resume'; code: string; token: string }
  | { type: 'startGame' }
  | { type: 'rematch' }
  | { type: 'action'; action: GameAction }
  | { type: 'leaveRoom' }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'joined'; room: RoomView; youId: string; token: string }
  | { type: 'room'; room: RoomView }
  | { type: 'state'; state: GameState; youId: string }
  | { type: 'error'; message: string; fatal?: boolean }
  | { type: 'left' }
  | { type: 'pong' };

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z2-9]{5}$/.test(code) && !/[IO01]/.test(code);
}
