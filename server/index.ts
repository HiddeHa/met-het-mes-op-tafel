import { createServer, type Server } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import sirv from 'sirv';
import { WebSocket, WebSocketServer } from 'ws';
import { createInitialState, gameReducer } from '../src/game/machine';
import { randomSeed } from '../src/game/rng';
import type { GameAction, GameConfig, GameState } from '../src/game/types';
import {
  isValidRoomCode,
  MAX_ROOM_PLAYERS,
  MIN_ROOM_PLAYERS,
  normalizeRoomCode,
  type ClientMessage,
  type ServerMessage,
} from '../src/net/protocol';
import { buildBotPlans, planKeyFor } from './bots';
import { projectStateFor } from './projection';
import {
  clampRounds,
  ensureHost,
  generateRoomCode,
  newRoomPlayer,
  sanitizeName,
  toRoomView,
  uniqueName,
  validDeck,
  type Room,
  type RoomPlayer,
} from './room';

interface Session {
  socket: WebSocket;
  roomCode: string | null;
  playerId: string | null;
  lastActionAt: number;
}

export interface OnlineServerOptions {
  port?: number;
  host?: string;
  serveStatic?: boolean;
  rootDir?: string;
  silent?: boolean;
  idleCleanupMs?: number;
}

export interface OnlineServer {
  httpServer: Server;
  wss: WebSocketServer;
  port: number;
  rooms: Map<string, Room>;
  close: () => Promise<void>;
}

const DEFAULT_IDLE_CLEANUP_MS = 6 * 60 * 60 * 1000;

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendError(session: Session, message: string, fatal = false): void {
  send(session.socket, { type: 'error', message, fatal });
}

function sendJoined(session: Session, room: Room, player: RoomPlayer): void {
  send(session.socket, {
    type: 'joined',
    room: toRoomView(room),
    youId: player.id,
    token: player.token,
  });
}

function sendStateTo(room: Room, player: RoomPlayer): void {
  if (!room.state || !player.gameId || !player.socket) return;
  send(player.socket, {
    type: 'state',
    state: projectStateFor(room.state, player.gameId),
    youId: player.gameId,
  });
}

function lanHost(): string | null {
  const candidates: string[] = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        candidates.push(address.address);
      }
    }
  }
  // Home routers hand out 192.168.x.x; VPN adapters tend to take the others.
  const ranked = candidates.sort((a, b) => scoreHost(b) - scoreHost(a));
  return ranked[0] ?? null;
}

function scoreHost(address: string): number {
  if (address.startsWith('192.168.')) return 3;
  if (address.startsWith('10.')) return 2;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 1;
  return 0;
}

function lanUrl(port: number): string | null {
  const host = lanHost();
  return host ? `http://${host}:${port}` : null;
}

export async function createOnlineServer(
  options: OnlineServerOptions = {},
): Promise<OnlineServer> {
  const rooms = new Map<string, Room>();
  const sessions = new Map<WebSocket, Session>();
  const rootDir = options.rootDir ?? process.cwd();
  const serveStatic = Boolean(options.serveStatic);
  const silent = Boolean(options.silent);
  const idleCleanupMs = options.idleCleanupMs ?? DEFAULT_IDLE_CLEANUP_MS;
  const networkHost = lanHost();

  const assets = serveStatic
    ? sirv(path.resolve(rootDir, 'dist'), {
        single: true,
        dev: false,
        maxAge: 3600,
      })
    : null;

  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }
    if (assets) {
      assets(req, res, () => {
        res.statusCode = 404;
        res.end('Not found');
      });
      return;
    }
    res.statusCode = 404;
    res.end('Not found');
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 64 * 1024,
  });

  function broadcastRoom(room: Room): void {
    const view = toRoomView(room);
    for (const player of room.players) {
      if (player.connected && player.socket) {
        send(player.socket, { type: 'room', room: view });
      }
    }
  }

  function broadcastState(room: Room): void {
    for (const player of room.players) {
      if (player.connected) sendStateTo(room, player);
    }
  }

  function syncPlans(room: Room): void {
    const key = planKeyFor(room);
    if (key === room.planKey) return;
    room.planKey = key;
    room.botPlans = buildBotPlans(room, Date.now());
  }

  function applyAction(room: Room, action: GameAction): boolean {
    if (!room.state) return false;
    const next = gameReducer(room.state, action);
    if (next === room.state) return false;

    room.state = next;
    room.updatedAt = Date.now();
    broadcastState(room);
    // Keep already-scheduled bot turns alive across plain 1s ticks. syncPlans
    // rebuilds only when the state signature actually changed.
    syncPlans(room);
    return true;
  }

  function stopRoomLoop(room: Room): void {
    if (room.loop) {
      clearInterval(room.loop);
      room.loop = null;
    }
  }

  function startRoomLoop(room: Room): void {
    stopRoomLoop(room);
    room.lastTickAt = Date.now();
    const loop = setInterval(() => {
      const now = Date.now();
      if (
        room.state &&
        ['answering', 'answerReveal', 'betting', 'shootout'].includes(
          room.state.phase,
        ) &&
        now - room.lastTickAt >= 1000
      ) {
        room.lastTickAt = now;
        applyAction(room, { type: 'tick' });
      }

      syncPlans(room);
      const due = room.botPlans
        .filter((plan) => plan.at <= Date.now())
        .sort((a, b) => a.at - b.at)[0];
      if (due) {
        room.botPlans = [];
        applyAction(room, due.action);
        syncPlans(room);
      }
    }, 250);
    loop.unref();
    room.loop = loop;
  }

  function deleteRoom(room: Room): void {
    stopRoomLoop(room);
    rooms.delete(room.code);
    for (const player of room.players) {
      if (player.socket && player.socket.readyState === WebSocket.OPEN) {
        player.socket.close(1000, 'Tafel gesloten');
      }
      player.socket = null;
      player.connected = false;
    }
  }

  function beginGame(room: Room): string | null {
    const connected = room.players.filter((player) => player.connected);
    if (connected.length < MIN_ROOM_PLAYERS) {
      return 'Er zijn minstens twee spelers nodig om te beginnen.';
    }

    room.players = connected;
    ensureHost(room);
    room.players.forEach((player, index) => {
      player.seat = index;
      player.gameId = `p${index}`;
      player.disconnectedAt = null;
    });

    // Online tables only ever seat the humans who joined: a two-player table
    // is a two-player game, not a two-player game with a bot in the third chair.
    const config: GameConfig = {
      mode: room.players.length === 3 ? 'local' : 'duo',
      names: room.players.map((player) => player.name),
      rounds: room.rounds,
      seed: randomSeed(),
      deck: room.deck,
      simultaneous: true,
      bots: 0,
    };

    room.state = gameReducer(createInitialState(), {
      type: 'startGame',
      config,
    });
    room.started = true;
    room.updatedAt = Date.now();
    room.planKey = '';
    room.botPlans = [];
    room.lastTickAt = Date.now();
    startRoomLoop(room);

    broadcastRoom(room);
    broadcastState(room);
    return null;
  }

  function validateAction(
    state: GameState,
    player: RoomPlayer,
    action: GameAction,
  ): GameAction | null {
    const gameId = player.gameId;
    if (!gameId) return null;
    const current = state.players.find((candidate) => candidate.id === gameId);
    if (!current) return null;

    switch (action.type) {
      case 'submitAnswers': {
        if (state.phase !== 'answering' || state.answerStage !== 'turn') return null;
        if (!Array.isArray(action.answers)) return null;
        const answers = Array.from({ length: 4 }, (_, index) => {
          const value = action.answers[index];
          return typeof value === 'string' ? value.slice(0, 140) : '';
        });
        if (state.config?.simultaneous) {
          // Parallel sheets: anyone may lock their own, but only once.
          if (!current || current.locked) return null;
          return { type: 'submitAnswers', answers, playerId: gameId };
        }
        if (state.activeAnswerer === null) return null;
        if (state.players[state.activeAnswerer]?.id !== gameId) return null;
        return { type: 'submitAnswers', answers };
      }
      case 'startBetting':
        return state.phase === 'answerReveal' ? { type: 'startBetting' } : null;
      case 'placeBet': {
        if (state.phase !== 'betting' || state.currentBidder === null) return null;
        if (state.players[state.currentBidder]?.id !== gameId) return null;
        if (typeof action.amount !== 'number' || !Number.isFinite(action.amount)) {
          return null;
        }
        return { type: 'placeBet', amount: Math.floor(action.amount) };
      }
      case 'callBet':
        if (state.phase !== 'betting' || state.currentBidder === null) return null;
        if (state.players[state.currentBidder]?.id !== gameId) return null;
        return { type: 'callBet' };
      case 'foldBet':
        if (state.phase !== 'betting' || state.currentBidder === null) return null;
        if (state.players[state.currentBidder]?.id !== gameId) return null;
        return { type: 'foldBet' };
      case 'beginAnswering':
        return state.phase === 'answering' && state.answerStage === 'preview'
          ? { type: 'beginAnswering' }
          : null;
      case 'nextRound':
        return state.phase === 'reveal' ? { type: 'nextRound' } : null;
      case 'buzz':
        if (state.phase !== 'shootout' || state.shootout?.stage !== 'open') return null;
        return { type: 'buzz', playerId: gameId };
      case 'shootoutAnswer':
        if (state.phase !== 'shootout' || state.shootout?.stage !== 'answering') {
          return null;
        }
        if (state.shootout.buzzedBy !== gameId) return null;
        if (typeof action.text !== 'string') return null;
        return { type: 'shootoutAnswer', text: action.text.slice(0, 140) };
      case 'finishShootout':
        return state.phase === 'shootout' && state.shootout?.stage === 'result'
          ? { type: 'finishShootout' }
          : null;
      default:
        return null;
    }
  }

  function leaveRoom(session: Session, explicit: boolean): void {
    const code = session.roomCode;
    const playerId = session.playerId;
    session.roomCode = null;
    session.playerId = null;
    if (!code || !playerId) {
      if (explicit) send(session.socket, { type: 'left' });
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      if (explicit) send(session.socket, { type: 'left' });
      return;
    }
    const player = room.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      if (explicit) send(session.socket, { type: 'left' });
      return;
    }
    if (player.socket && player.socket !== session.socket) {
      if (explicit) send(session.socket, { type: 'left' });
      return;
    }

    room.updatedAt = Date.now();
    if (explicit) send(session.socket, { type: 'left' });
    if (!room.started) {
      room.players = room.players.filter((candidate) => candidate.id !== playerId);
      player.connected = false;
      player.socket = null;
      if (room.players.length === 0) {
        stopRoomLoop(room);
        rooms.delete(room.code);
      } else {
        ensureHost(room);
        broadcastRoom(room);
      }
    } else {
      player.connected = false;
      player.socket = null;
      player.disconnectedAt = Date.now();
      ensureHost(room);
      room.planKey = '';
      room.botPlans = [];
      broadcastRoom(room);
      syncPlans(room);
    }
  }

  function handleMessage(session: Session, raw: string): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      sendError(session, 'Ongeldig bericht.');
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      sendError(session, 'Ongeldig bericht.');
      return;
    }

    switch (message.type) {
      case 'ping':
        send(session.socket, { type: 'pong' });
        return;

      case 'createRoom': {
        if (session.roomCode) {
          sendError(session, 'Je zit al aan een tafel.');
          return;
        }
        const now = Date.now();
        const code = generateRoomCode(new Set(rooms.keys()));
        const deck = validDeck(message.deck);
        const room: Room = {
          code,
          hostId: '',
          players: [],
          deck,
          rounds: clampRounds(message.rounds, deck),
          started: false,
          state: null,
          lanHost: networkHost,
          createdAt: now,
          updatedAt: now,
          loop: null,
          lastTickAt: now,
          planKey: 'no-state',
          botPlans: [],
        };
        const player = newRoomPlayer(sanitizeName(message.name), session.socket);
        room.players.push(player);
        room.hostId = player.id;
        rooms.set(code, room);
        session.roomCode = code;
        session.playerId = player.id;
        sendJoined(session, room, player);
        return;
      }

      case 'joinRoom': {
        if (session.roomCode) {
          sendError(session, 'Je zit al aan een tafel.');
          return;
        }
        if (typeof message.code !== 'string') {
          sendError(session, 'Die tafelcode klopt niet.');
          return;
        }
        const code = normalizeRoomCode(message.code);
        if (!isValidRoomCode(code)) {
          sendError(session, 'Die tafelcode klopt niet.');
          return;
        }
        const room = rooms.get(code);
        if (!room) {
          sendError(session, 'Geen tafel gevonden met die code.');
          return;
        }
        if (room.started) {
          sendError(session, 'Dat spel is al begonnen.');
          return;
        }
        if (room.players.length >= MAX_ROOM_PLAYERS) {
          sendError(session, 'Deze tafel is al vol.');
          return;
        }
        const player = newRoomPlayer(
          uniqueName(message.name, room.players),
          session.socket,
        );
        room.players.push(player);
        room.updatedAt = Date.now();
        session.roomCode = code;
        session.playerId = player.id;
        sendJoined(session, room, player);
        broadcastRoom(room);
        return;
      }

      case 'resume': {
        if (session.roomCode) {
          sendError(session, 'Je zit al aan een tafel.');
          return;
        }
        if (typeof message.code !== 'string' || typeof message.token !== 'string') {
          sendError(session, 'Deze tafel bestaat niet meer.', true);
          return;
        }
        const code = normalizeRoomCode(message.code);
        const room = rooms.get(code);
        if (!room) {
          sendError(session, 'Deze tafel bestaat niet meer.', true);
          return;
        }
        const player = room.players.find(
          (candidate) => candidate.token === message.token,
        );
        if (!player) {
          sendError(session, 'Je plek aan deze tafel is verlopen.', true);
          return;
        }
        if (player.socket && player.socket !== session.socket) {
          player.socket.close(4001, 'Opnieuw verbonden');
        }
        player.socket = session.socket;
        player.connected = true;
        player.disconnectedAt = null;
        ensureHost(room);
        session.roomCode = code;
        session.playerId = player.id;
        room.updatedAt = Date.now();
        room.planKey = '';
        room.botPlans = [];
        sendJoined(session, room, player);
        broadcastRoom(room);
        if (room.started) {
          if (!player.gameId) {
            sendError(session, 'Dit spel is al begonnen zonder jou.', true);
            return;
          }
          sendStateTo(room, player);
          syncPlans(room);
        }
        return;
      }

      case 'startGame': {
        const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
        if (!room) {
          sendError(session, 'Je zit niet aan een tafel.');
          return;
        }
        if (room.hostId !== session.playerId) {
          sendError(session, 'Alleen de host kan het spel starten.');
          return;
        }
        if (room.started) {
          sendError(session, 'Het spel is al begonnen.');
          return;
        }
        const error = beginGame(room);
        if (error) sendError(session, error);
        return;
      }

      case 'rematch': {
        const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
        if (!room || !room.started || !room.state) {
          sendError(session, 'Er is nog geen afgelopen spel.');
          return;
        }
        if (room.state.phase !== 'gameOver') {
          sendError(session, 'Het spel is nog bezig.');
          return;
        }
        const error = beginGame(room);
        if (error) sendError(session, error);
        return;
      }

      case 'action': {
        const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
        if (!room || !room.started || !room.state) {
          sendError(session, 'Je zit niet in een actief spel.');
          return;
        }
        const player =
          session.playerId && room.players.find((candidate) => candidate.id === session.playerId);
        if (!player || !player.connected || player.socket !== session.socket) {
          return;
        }
        const now = Date.now();
        if (now - session.lastActionAt < 80) return;
        session.lastActionAt = now;
        if (
          !message.action ||
          typeof message.action !== 'object' ||
          typeof message.action.type !== 'string'
        ) {
          return;
        }
        const action = validateAction(room.state, player, message.action);
        if (!action) return;
        applyAction(room, action);
        return;
      }

      case 'leaveRoom':
        leaveRoom(session, true);
        return;

      default:
        sendError(session, 'Onbekend bericht.');
    }
  }

  wss.on('connection', (socket) => {
    const session: Session = {
      socket,
      roomCode: null,
      playerId: null,
      lastActionAt: 0,
    };
    sessions.set(socket, session);

    socket.on('message', (data) => {
      handleMessage(session, data.toString());
    });

    socket.on('close', () => {
      sessions.delete(socket);
      if (session.roomCode && session.playerId) {
        const room = rooms.get(session.roomCode);
        const player = room?.players.find(
          (candidate) => candidate.id === session.playerId,
        );
        if (room && player && player.socket === socket) {
          player.socket = null;
          player.connected = false;
          player.disconnectedAt = Date.now();
          room.updatedAt = Date.now();
          if (!room.started) {
            room.players = room.players.filter(
              (candidate) => candidate.id !== player.id,
            );
            if (room.players.length === 0) {
              deleteRoom(room);
            } else {
              ensureHost(room);
              broadcastRoom(room);
            }
          } else {
            ensureHost(room);
            room.planKey = '';
            room.botPlans = [];
            broadcastRoom(room);
            syncPlans(room);
          }
        }
      }
      session.roomCode = null;
      session.playerId = null;
    });

    socket.on('error', () => {
      socket.close();
    });
  });

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (
        room.players.every((player) => !player.connected) &&
        now - room.updatedAt > idleCleanupMs
      ) {
        deleteRoom(room);
      }
    }
  }, Math.min(60_000, Math.max(1000, Math.floor(idleCleanupMs / 2))));
  cleanupTimer.unref();

  const port = options.port ?? 8787;
  const host = options.host ?? '0.0.0.0';

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const actualPort =
    address && typeof address === 'object' ? address.port : port;

  if (!silent) {
    if (serveStatic) {
      const local = `http://localhost:${actualPort}`;
      const lan = lanUrl(actualPort);
      console.log(`[online] Spelserver: ${local}`);
      if (lan && lan !== local) console.log(`[online] In je netwerk: ${lan}`);
    } else {
      console.log(`[online] WebSocket-server: ws://localhost:${actualPort}/ws`);
      console.log('[online] Start de client met npm run dev (Vite proxyt /ws).');
    }
  }

  async function close(): Promise<void> {
    clearInterval(cleanupTimer);
    for (const room of rooms.values()) {
      stopRoomLoop(room);
    }
    for (const client of wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    rooms.clear();
    sessions.clear();
  }

  return {
    httpServer,
    wss,
    port: actualPort,
    rooms,
    close,
  };
}
