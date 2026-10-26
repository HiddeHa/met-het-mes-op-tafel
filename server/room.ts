import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { AVATARS, maxRoundsForDeck } from '../src/game/engine';
import type { GameAction, GameState, QuestionDeck } from '../src/game/types';
import {
  MAX_NAME_LENGTH,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  type RoomView,
} from '../src/net/protocol';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  socket: WebSocket | null;
  seat: number | null;
  gameId: string | null;
  disconnectedAt: number | null;
}

export interface BotPlan {
  at: number;
  action: GameAction;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  deck: QuestionDeck;
  rounds: number;
  started: boolean;
  state: GameState | null;
  lanHost: string | null;
  createdAt: number;
  updatedAt: number;
  loop: NodeJS.Timeout | null;
  lastTickAt: number;
  planKey: string;
  botPlans: BotPlan[];
}

export function randomToken(): string {
  return randomBytes(24).toString('hex');
}

export function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error('Could not allocate a room code');
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Speler';
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned || 'Speler';
}

export function uniqueName(raw: unknown, players: RoomPlayer[]): string {
  const base = sanitizeName(raw);
  const taken = new Set(players.map((player) => player.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  for (let suffix = 2; suffix < 100; suffix++) {
    const ending = ` ${suffix}`;
    const candidate = `${base.slice(0, MAX_NAME_LENGTH - ending.length)}${ending}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

export function clampRounds(raw: unknown, deck: QuestionDeck = 'classic'): number {
  const max = maxRoundsForDeck(deck);
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return Math.min(7, max);
  return Math.min(max, Math.max(3, Math.round(raw)));
}

export function validDeck(raw: unknown): QuestionDeck {
  return raw === 'memes' ? 'memes' : 'classic';
}

export function newRoomPlayer(
  name: string,
  socket: WebSocket,
): RoomPlayer {
  return {
    id: randomUUID(),
    token: randomToken(),
    name,
    connected: true,
    socket,
    seat: null,
    gameId: null,
    disconnectedAt: null,
  };
}

export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    hostId: room.hostId,
    deck: room.deck,
    rounds: room.rounds,
    started: room.started,
    minPlayers: MIN_ROOM_PLAYERS,
    maxPlayers: MAX_ROOM_PLAYERS,
    lanHost: room.lanHost,
    players: room.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      avatar: AVATARS[index % AVATARS.length],
      connected: player.connected,
      isHost: player.id === room.hostId,
    })),
  };
}

export function ensureHost(room: Room): void {
  const current = room.players.find((player) => player.id === room.hostId);
  if (current?.connected) return;
  const next = room.players.find((player) => player.connected);
  if (next) room.hostId = next.id;
}

export function roomPlayer(room: Room, playerId: string): RoomPlayer | undefined {
  return room.players.find((player) => player.id === playerId);
}
