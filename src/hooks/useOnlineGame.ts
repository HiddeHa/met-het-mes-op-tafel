import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState, QuestionDeck } from '../game/types';
import {
  normalizeRoomCode,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from '../net/protocol';

const STORAGE_KEY = 'mes-op-tafel-online-session';
const MAX_RECONNECT_DELAY = 8000;

interface StoredSession {
  code: string;
  token: string;
}

export interface OnlineController {
  status: 'idle' | 'connecting' | 'connected';
  connected: boolean;
  resuming: boolean;
  error: string | null;
  room: RoomView | null;
  state: GameState | null;
  roomYouId: string | null;
  gameYouId: string | null;
  inviteUrl: string | null;
  createRoom: (name: string, rounds: number, deck: QuestionDeck) => void;
  joinRoom: (name: string, code: string) => void;
  startGame: () => void;
  rematch: () => void;
  leaveRoom: () => void;
  dispatch: (action: GameAction) => void;
  clearError: () => void;
}

function loadSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.code !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    return { code: parsed.code, token: parsed.token };
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage may be unavailable; reconnect only works for this tab.
  }
}

function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function useOnlineGame(): OnlineController {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [connected, setConnected] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [roomYouId, setRoomYouId] = useState<string | null>(null);
  const [gameYouId, setGameYouId] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const pendingRef = useRef<ClientMessage | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const stoppedRef = useRef(false);
  const lastPongRef = useRef(Date.now());
  const bootstrappedRef = useRef(false);

  function sendRaw(message: ClientMessage): void {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function scheduleReconnect(): void {
    if (stoppedRef.current) return;
    clearReconnectTimer();
    const attempt = reconnectAttemptsRef.current++;
    const delay = Math.min(
      MAX_RECONNECT_DELAY,
      500 * 2 ** Math.min(attempt, 4),
    );
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connectRef.current();
    }, delay);
  }

  function handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'joined': {
        const session = { code: message.room.code, token: message.token };
        sessionRef.current = session;
        saveSession(session);
        setRoom(message.room);
        setRoomYouId(message.youId);
        setResuming(false);
        setError(null);
        setStatus('connected');
        setConnected(true);
        if (!message.room.started) {
          setState(null);
          setGameYouId(null);
        }
        return;
      }
      case 'room':
        setRoom(message.room);
        if (!message.room.started) {
          setState(null);
          setGameYouId(null);
        }
        return;
      case 'state':
        setState(message.state);
        setGameYouId(message.youId);
        setResuming(false);
        setError(null);
        return;
      case 'error':
        setError(message.message);
        setResuming(false);
        if (message.fatal) {
          sessionRef.current = null;
          clearSession();
          setRoom(null);
          setState(null);
          setRoomYouId(null);
          setGameYouId(null);
          setStatus('idle');
          stoppedRef.current = true;
          clearReconnectTimer();
          socketRef.current?.close(1000, 'Session ended');
          socketRef.current = null;
          setConnected(false);
        }
        return;
      case 'left':
        sessionRef.current = null;
        clearSession();
        setRoom(null);
        setState(null);
        setRoomYouId(null);
        setGameYouId(null);
        setStatus('idle');
        return;
      case 'pong':
        lastPongRef.current = Date.now();
        return;
    }
  }

  function connect(): void {
    const existing = socketRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    stoppedRef.current = false;
    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = socket;

    socket.onopen = () => {
      if (stoppedRef.current) {
        socket.close(1000, 'Left');
        return;
      }
      setConnected(true);
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
      lastPongRef.current = Date.now();
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        sendRaw(pending);
      } else if (sessionRef.current) {
        sendRaw({
          type: 'resume',
          code: sessionRef.current.code,
          token: sessionRef.current.token,
        });
      }
    };

    socket.onmessage = (event) => {
      try {
        handleServerMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        setError('De spelserver stuurde een onleesbaar bericht.');
      }
    };

    socket.onclose = (event) => {
      if (socketRef.current === socket) socketRef.current = null;
      setConnected(false);
      if (stoppedRef.current || event.code === 1000) {
        setStatus('idle');
        return;
      }
      if (event.code === 4001) {
        stoppedRef.current = true;
        clearReconnectTimer();
        setStatus('idle');
        setError('Deze tafel is in een ander tabblad geopend.');
        return;
      }
      if (sessionRef.current) {
        setStatus('connecting');
        scheduleReconnect();
        if (reconnectAttemptsRef.current >= 5) {
          setResuming(false);
          setError('Verbinding kwijt. We proberen opnieuw verbinding te maken…');
        }
        return;
      }
      setStatus('idle');
      const hadPending = pendingRef.current !== null;
      pendingRef.current = null;
      if (hadPending) {
        setError('Kan de spelserver niet bereiken. Draait de server?');
      }
    };

    socket.onerror = () => {
      // The close event carries the actionable state.
    };
  }
  connectRef.current = connect;

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const urlCode = new URLSearchParams(window.location.search).get('room');
    const saved = loadSession();
    if (saved && (!urlCode || normalizeRoomCode(urlCode) === saved.code)) {
      sessionRef.current = saved;
      setResuming(true);
      reconnectAttemptsRef.current = 1;
      connectRef.current();
    } else if (saved) {
      clearSession();
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongRef.current > 45000) {
        socket.close();
        return;
      }
      sendRaw({ type: 'ping' });
    }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  function sendOrQueue(message: ClientMessage): void {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      sendRaw(message);
      return;
    }
    pendingRef.current = message;
    stoppedRef.current = false;
    connectRef.current();
  }

  function createRoom(name: string, rounds: number, deck: QuestionDeck): void {
    sessionRef.current = null;
    clearSession();
    setError(null);
    setStatus('connecting');
    sendOrQueue({ type: 'createRoom', name, rounds, deck });
  }

  function joinRoom(name: string, code: string): void {
    const normalized = normalizeRoomCode(code);
    if (normalized.length !== 5) {
      setError('Vul de volledige tafelcode van vijf tekens in.');
      return;
    }
    sessionRef.current = null;
    clearSession();
    setError(null);
    setStatus('connecting');
    sendOrQueue({ type: 'joinRoom', name, code: normalized });
  }

  function startGame(): void {
    sendRaw({ type: 'startGame' });
  }

  function rematch(): void {
    sendRaw({ type: 'rematch' });
  }

  function leaveRoom(): void {
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    pendingRef.current = null;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      sendRaw({ type: 'leaveRoom' });
    }
    sessionRef.current = null;
    clearSession();
    setRoom(null);
    setState(null);
    setRoomYouId(null);
    setGameYouId(null);
    setError(null);
    setResuming(false);
    setStatus('idle');
    setConnected(false);
  }

  function dispatch(action: GameAction): void {
    if (
      action.type === 'tick' ||
      action.type === 'startGame' ||
      action.type === 'backToMenu' ||
      action.type === 'openCurtain'
    ) {
      return;
    }
    sendRaw({ type: 'action', action });
  }

  const inviteUrl = room
    ? `${window.location.origin}${window.location.pathname}?room=${room.code}`
    : null;

  return {
    status,
    connected,
    resuming,
    error,
    room,
    state,
    roomYouId,
    gameYouId,
    inviteUrl,
    createRoom,
    joinRoom,
    startGame,
    rematch,
    leaveRoom,
    dispatch,
    clearError: () => setError(null),
  };
}
