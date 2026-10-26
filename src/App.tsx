import { useEffect, useState } from 'react';
import { Brand } from './components/Brand';
import { EndScreen } from './components/EndScreen';
import { GameScreen } from './components/GameScreen';
import { Lobby } from './components/Lobby';
import { OnlineRoom } from './components/OnlineRoom';
import { RulesModal } from './components/RulesModal';
import { randomSeed } from './game/rng';
import { playSound, setMuted } from './game/sound';
import type { GameConfig } from './game/types';
import { useGame } from './hooks/useGame';
import { useGameAudio } from './hooks/useGameAudio';
import { useOnlineGame } from './hooks/useOnlineGame';
import type { OnlineGameMeta } from './net/protocol';

const SOUND_KEY = 'mes-op-tafel-sound';

function loadSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

export default function App() {
  const [soundOn, setSoundOn] = useState(loadSoundPreference);
  const [rulesOpen, setRulesOpen] = useState(false);
  const localGame = useGame(rulesOpen);
  const online = useOnlineGame();

  const activeState = online.state ?? localGame.state;
  useGameAudio(activeState, soundOn);

  useEffect(() => {
    setMuted(!soundOn);
    try {
      window.localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    } catch {
      // Storage may be unavailable; the sound setting still works for this session.
    }
  }, [soundOn]);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
    if (next) playSound('click');
  }

  function openRules() {
    playSound('click');
    setRulesOpen(true);
  }

  function startGame(config: GameConfig) {
    playSound('click');
    localGame.dispatch({ type: 'startGame', config });
  }

  function playAgain() {
    if (!localGame.state.config) return;
    playSound('click');
    localGame.dispatch({
      type: 'startGame',
      config: { ...localGame.state.config, seed: randomSeed() },
    });
  }

  function goToMenu() {
    playSound('click');
    localGame.dispatch({ type: 'backToMenu' });
  }

  function quitGame() {
    if (online.room) {
      if (window.confirm('Spel verlaten? De huidige pot en stand gaan verloren.')) {
        playSound('click');
        online.leaveRoom();
      }
      return;
    }
    if (window.confirm('Spel verlaten? De huidige pot en stand gaan verloren.')) {
      playSound('click');
      localGame.dispatch({ type: 'backToMenu' });
    }
  }

  const rules = rulesOpen ? <RulesModal onClose={() => setRulesOpen(false)} /> : null;
  const onlineMeta: OnlineGameMeta | undefined = online.room
    ? {
        roomCode: online.room.code,
        youId: online.gameYouId ?? '',
        roomYouId: online.roomYouId ?? '',
        isHost: online.room.hostId === online.roomYouId,
        connected: online.connected,
      }
    : undefined;

  if (online.resuming && !online.room) {
    return (
      <div className="online-boot">
        <div className="game-glow" aria-hidden />
        <Brand />
        <p>Terug naar je tafel…</p>
        <span className="thinking-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>
    );
  }

  if (online.room) {
    if (online.state) {
      if (online.state.phase === 'gameOver') {
        return (
          <>
            <EndScreen
              state={online.state}
              onPlayAgain={online.rematch}
              onMenu={online.leaveRoom}
              soundOn={soundOn}
              onToggleSound={toggleSound}
              onOpenRules={openRules}
              onlineError={online.error}
            />
            {rules}
          </>
        );
      }

      return (
        <>
          <GameScreen
            state={online.state}
            dispatch={online.dispatch}
            soundOn={soundOn}
            onToggleSound={toggleSound}
            onOpenRules={openRules}
            onQuit={quitGame}
            paused={rulesOpen}
            online={onlineMeta}
          />
          {rules}
        </>
      );
    }

    return (
      <>
        <OnlineRoom
          room={online.room}
          youId={online.roomYouId}
          connected={online.connected}
          error={online.error}
          inviteUrl={online.inviteUrl}
          onStart={online.startGame}
          onLeave={online.leaveRoom}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          onOpenRules={openRules}
        />
        {rules}
      </>
    );
  }

  if (localGame.state.phase === 'menu') {
    return (
      <>
        <Lobby
          soundOn={soundOn}
          onToggleSound={toggleSound}
          onOpenRules={openRules}
          onStart={startGame}
          onCreateRoom={online.createRoom}
          onJoinRoom={online.joinRoom}
          onlineBusy={online.status === 'connecting'}
          onlineError={online.error}
          initialOnline={Boolean(online.error)}
        />
        {rules}
      </>
    );
  }

  if (localGame.state.phase === 'gameOver') {
    return (
      <>
        <EndScreen
          state={localGame.state}
          onPlayAgain={playAgain}
          onMenu={goToMenu}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          onOpenRules={openRules}
        />
        {rules}
      </>
    );
  }

  return (
    <>
      <GameScreen
        state={localGame.state}
        dispatch={localGame.dispatch}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onOpenRules={openRules}
        onQuit={quitGame}
        paused={rulesOpen}
      />
      {rules}
    </>
  );
}
