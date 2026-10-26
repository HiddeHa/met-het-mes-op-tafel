import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { GameState } from '../src/game/types';
import type {
  ClientMessage,
  RoomView,
  ServerMessage,
} from '../src/net/protocol';
import { createOnlineServer, type OnlineServer } from './index';

class TestClient {
  readonly ws: WebSocket;
  lastRoom: RoomView | null = null;
  lastState: GameState | null = null;
  lastYouId: string | null = null;
  private queue: ServerMessage[] = [];
  private waiters: {
    type: ServerMessage['type'];
    resolve: (message: ServerMessage) => void;
  }[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.type === 'room') this.lastRoom = message.room;
      if (message.type === 'state') {
        this.lastState = message.state;
        this.lastYouId = message.youId;
      }
      const index = this.waiters.findIndex((waiter) => waiter.type === message.type);
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        waiter.resolve(message);
      } else {
        this.queue.push(message);
      }
    });
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
  }

  wait<T extends ServerMessage['type']>(
    type: T,
    timeout = 5000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const index = this.queue.findIndex((message) => message.type === type);
    if (index >= 0) {
      return Promise.resolve(
        this.queue.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>,
      );
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        type,
        resolve: (message: ServerMessage) =>
          resolve(message as Extract<ServerMessage, { type: T }>),
      };
      this.waiters.push(waiter);
      setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        reject(new Error(`timeout waiting for ${type}`));
      }, timeout);
    });
  }

  waitState(
    predicate: (state: GameState) => boolean,
    timeout = 5000,
  ): Promise<GameState> {
    if (this.lastState && predicate(this.lastState)) {
      return Promise.resolve(this.lastState);
    }
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (this.lastState && predicate(this.lastState)) {
          clearInterval(poll);
          resolve(this.lastState);
        } else if (Date.now() - started > timeout) {
          clearInterval(poll);
          reject(new Error('timeout waiting for state'));
        }
      }, 25);
    });
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    this.ws.close();
  }
}

async function waitUntil(
  read: () => RoomView | null,
  predicate: (room: RoomView) => boolean,
  timeout = 5000,
): Promise<RoomView> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const room = read();
    if (room && predicate(room)) return room;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timeout waiting for room');
}

describe('online rooms', () => {
  let server: OnlineServer;
  const clients: TestClient[] = [];
  let url = '';

  beforeAll(async () => {
    server = await createOnlineServer({
      port: 0,
      host: '127.0.0.1',
      silent: true,
      idleCleanupMs: 60000,
    });
    url = `ws://127.0.0.1:${server.port}/ws`;
  });

  afterAll(async () => {
    for (const client of clients) client.close();
    await server.close();
  });

  function client(): TestClient {
    const next = new TestClient(url);
    clients.push(next);
    return next;
  }

  it('creates, joins and starts a room without leaking secret sheets', async () => {
    const host = client();
    await host.open();
    host.send({
      type: 'createRoom',
      name: 'Host',
      rounds: 3,
      deck: 'classic',
    });
    const hostJoined = await host.wait('joined');
    expect(hostJoined.room.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(hostJoined.room.players).toHaveLength(1);
    expect(hostJoined.room.players[0].isHost).toBe(true);

    const friend = client();
    await friend.open();
    friend.send({
      type: 'joinRoom',
      code: hostJoined.room.code.toLowerCase(),
      name: 'Friend',
    });
    const friendJoined = await friend.wait('joined');
    expect(friendJoined.room.players).toHaveLength(2);

    host.send({ type: 'startGame' });
    const hostState = await host.waitState((state) => state.phase === 'answering');
    await friend.waitState((state) => state.phase === 'answering');
    // Two humans, no bot: the empty third chair stays empty.
    expect(hostState.players).toHaveLength(2);
    expect(hostState.players.some((player) => player.isBot)).toBe(false);
    expect(hostState.config?.simultaneous).toBe(true);
    expect(hostState.config?.bots).toBe(0);
    expect(host.lastYouId).toBe('p0');
    expect(friend.lastYouId).toBe('p1');

    host.send({ type: 'action', action: { type: 'beginAnswering' } });
    // Both humans get their own sheet at the same moment.
    const opened = await friend.waitState(
      (state) => state.answerStage === 'turn' && state.activeAnswerer === null,
    );
    expect(opened.players.every((player) => !player.locked)).toBe(true);

    // The server drops actions sent within 80ms of the previous one; a real
    // player never clicks that fast.
    await new Promise((resolve) => setTimeout(resolve, 150));

    // The host writes their sheet, and cannot write the friend's by claiming
    // the friend's seat id in the message.
    host.send({
      type: 'action',
      action: {
        type: 'submitAnswers',
        answers: ['Kind of Blue', 'drie', 'Higgs', 'Rijksmuseum'],
        playerId: 'p1',
      },
    });
    await friend.waitState((state) => state.players[0].locked);
    expect(friend.lastState?.players[1].locked).toBe(false);
    expect(friend.lastState?.players[0].answers).toEqual(['', '', '', '']);

    friend.send({
      type: 'action',
      action: {
        type: 'submitAnswers',
        answers: ['Kind of Blue', 'drie', 'Higgs', 'Rijksmuseum'],
      },
    });
    await host.waitState((state) => state.players[1].locked);
    await friend.waitState((state) => state.players[1].locked);

    expect(friend.lastState?.players[1].answers).toEqual([
      'Kind of Blue',
      'drie',
      'Higgs',
      'Rijksmuseum',
    ]);
    expect(host.lastState?.players[1].answers).toEqual(['', '', '', '']);
    expect(host.lastState?.phase).toBe('answerReveal');
    expect(
      host.lastState?.questions.every((question) => question.answers.length > 0),
    ).toBe(true);
    expect(host.lastState?.config?.seed).toBe(0);
    expect(host.lastState?.pool).toEqual([]);

    // The answers are on the table; the host opens the bidding round.
    await new Promise((resolve) => setTimeout(resolve, 150));
    host.send({ type: 'action', action: { type: 'startBetting' } });
    const betting = await host.waitState(
      (state) => state.phase === 'betting',
      12000,
    );
    expect(betting.players.every((player) => player.locked)).toBe(true);
    expect(betting.currentBidder).not.toBeNull();
  }, 20000);

  it('carries the chosen question set and caps meme rounds', async () => {
    const host = client();
    await host.open();
    host.send({
      type: 'createRoom',
      name: 'Host',
      rounds: 9,
      deck: 'memes',
    });
    const joined = await host.wait('joined');
    expect(joined.room.deck).toBe('memes');
    expect(joined.room.rounds).toBe(7);

    const friend = client();
    await friend.open();
    friend.send({ type: 'joinRoom', code: joined.room.code, name: 'Friend' });
    await friend.wait('joined');

    host.send({ type: 'startGame' });
    const state = await host.waitState((next) => next.phase === 'answering');
    expect(state.config?.deck).toBe('memes');
    expect(state.questions.every((question) => question.category === 'Memes')).toBe(
      true,
    );
    expect(state.pool.every((question) => question.category === 'Memes')).toBe(true);
  });

  it('resumes a seat with the saved token after a disconnect', async () => {
    const host = client();
    await host.open();
    host.send({
      type: 'createRoom',
      name: 'Host',
      rounds: 3,
      deck: 'classic',
    });
    const hostJoined = await host.wait('joined');
    const friend = client();
    await friend.open();
    friend.send({
      type: 'joinRoom',
      code: hostJoined.room.code,
      name: 'Friend',
    });
    await friend.wait('joined');
    host.send({ type: 'startGame' });
    await host.waitState((state) => state.phase === 'answering');
    await friend.waitState((state) => state.phase === 'answering');

    host.close();
    await waitUntil(
      () => friend.lastRoom,
      (room) =>
        room.players.some(
          (player) => player.name === 'Host' && !player.connected,
        ),
    );

    const resumed = client();
    await resumed.open();
    resumed.send({
      type: 'resume',
      code: hostJoined.room.code,
      token: hostJoined.token,
    });
    const joined = await resumed.wait('joined');
    expect(joined.youId).toBe(hostJoined.youId);
    await resumed.waitState((state) => state.phase === 'answering');
    expect(resumed.lastYouId).toBe('p0');

    await waitUntil(
      () => friend.lastRoom,
      (room) =>
        room.players.some(
          (player) => player.name === 'Host' && player.connected,
        ),
    );
  });
});
