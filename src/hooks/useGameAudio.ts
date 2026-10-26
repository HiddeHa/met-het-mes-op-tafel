import { useEffect, useRef } from 'react';
import { playSound, setMuted, type SoundName } from '../game/sound';
import type { GameState } from '../game/types';

const EVENT_SOUNDS: Record<string, SoundName> = {
  lock: 'lock',
  bet: 'coin',
  fold: 'whoosh',
  buzz: 'buzz',
  correct: 'correct',
  wrong: 'wrong',
  potwin: 'coin',
  carry: 'whoosh',
  bonus: 'coin',
};

export function useGameAudio(state: GameState, enabled: boolean): void {
  const lastEventId = useRef(0);
  const previousPhase = useRef<GameState['phase']>(state.phase);

  useEffect(() => {
    setMuted(!enabled);
  }, [enabled]);

  useEffect(() => {
    const event = state.lastEvent;
    if (!event || event.id === lastEventId.current) return;
    lastEventId.current = event.id;
    if (!enabled) return;
    const sound = EVENT_SOUNDS[event.kind];
    if (sound) playSound(sound);
  }, [state.lastEvent, enabled]);

  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = state.phase;
    if (!enabled) return;
    if (state.phase === 'reveal' && previous !== 'reveal') {
      playSound('sting');
    }
    if (state.phase === 'gameOver' && previous !== 'gameOver') {
      playSound('fanfare');
    }
    if (state.phase === 'shootout' && previous !== 'shootout') {
      playSound('whoosh');
    }
  }, [state.phase, enabled]);
}
