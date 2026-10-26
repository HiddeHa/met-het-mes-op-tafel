import { useState } from 'react';
import {
  DECK_LABELS,
  deckQuestions,
  humanCount,
  roundOptionsForDeck,
} from '../game/engine';
import { randomSeed } from '../game/rng';
import type { GameConfig, GameMode, QuestionDeck } from '../game/types';
import { normalizeRoomCode } from '../net/protocol';
import { Brand } from './Brand';
import { HeaderActions } from './HeaderActions';

type LobbyMode = GameMode | 'online';

const MODES: { id: LobbyMode; name: string; sub: string; emoji: string }[] = [
  { id: 'solo', name: 'Solo', sub: 'Jij tegen twee bots', emoji: '🤖' },
  { id: 'duo', name: 'Duo', sub: 'Twee spelers + bot', emoji: '👥' },
  { id: 'local', name: 'Lokaal', sub: 'Drie spelers, één scherm', emoji: '🍻' },
  { id: 'online', name: 'Online', sub: 'Met een vriend, eigen scherm', emoji: '🌐' },
];

const DECKS: { id: QuestionDeck; name: string; sub: string }[] = [
  {
    id: 'classic',
    name: DECK_LABELS.classic,
    sub: `${deckQuestions('classic').length} vragen · 7 categorieën`,
  },
  {
    id: 'memes',
    name: DECK_LABELS.memes,
    sub: `${deckQuestions('memes').length} memevragen`,
  },
];

interface LobbyProps {
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
  onStart: (config: GameConfig) => void;
  onCreateRoom: (name: string, rounds: number, deck: QuestionDeck) => void;
  onJoinRoom: (name: string, code: string) => void;
  onlineBusy: boolean;
  onlineError: string | null;
  initialOnline?: boolean;
}

export function Lobby({
  soundOn,
  onToggleSound,
  onOpenRules,
  onStart,
  onCreateRoom,
  onJoinRoom,
  onlineBusy,
  onlineError,
  initialOnline = false,
}: LobbyProps) {
  const roomParam = new URLSearchParams(window.location.search)
    .get('room')
    ?.toUpperCase() ?? '';
  const [mode, setMode] = useState<LobbyMode>(() =>
    initialOnline || roomParam ? 'online' : 'solo',
  );
  const [onlineTab, setOnlineTab] = useState<'create' | 'join'>(
    roomParam ? 'join' : 'create',
  );
  const [joinCode, setJoinCode] = useState(roomParam.slice(0, 5));
  const [names, setNames] = useState(['', '', '']);
  const [rounds, setRounds] = useState(7);
  const [deck, setDeck] = useState<QuestionDeck>('classic');
  const roundOptions = roundOptionsForDeck(deck);

  const isOnline = mode === 'online';
  const humans = isOnline ? 1 : humanCount(mode);
  const showSetupDetails = !isOnline || onlineTab === 'create';

  function updateName(index: number, value: string) {
    setNames((current) =>
      current.map((name, position) => (position === index ? value : name)),
    );
  }

  function chooseDeck(next: QuestionDeck) {
    setDeck(next);
    if (!roundOptionsForDeck(next).includes(rounds)) setRounds(7);
  }

  function submit() {
    if (isOnline) {
      if (onlineTab === 'create') {
        onCreateRoom(names[0], rounds, deck);
      } else {
        onJoinRoom(names[0], joinCode);
      }
      return;
    }
    onStart({
      mode,
      names: names.slice(0, humans),
      rounds,
      deck,
      seed: randomSeed(),
    });
  }

  const actionDisabled =
    isOnline &&
    (onlineBusy || (onlineTab === 'join' && joinCode.length !== 5));

  return (
    <div className="lobby">
      <div className="lobby-glow" aria-hidden />
      <header className="lobby-top">
        <Brand />
        <HeaderActions
          soundOn={soundOn}
          onToggleSound={onToggleSound}
          onOpenRules={onOpenRules}
        />
      </header>

      <main className="lobby-grid">
        <section className="hero">
          <p className="eyebrow">Het spelprogramma dat je zelf speelt</p>
          <h2 className="hero-title">
            Weet het.
            <br />
            Zet het in.
            <br />
            <span>Pak de pot.</span>
          </h2>
          <p className="hero-lead">
            Drie spelers. Eén centrale pot. Klassieke trivia of een potje
            memekennis. Je antwoord staat op slot vóór de inzetronde begint —
            dus durf je te bluffen? Speel samen op één scherm of nodig een
            vriend uit met een tafelcode.
          </p>

          <ol className="hero-flow">
            <li>
              <span className="flow-num">01</span>
              <div>
                <strong>Antwoord</strong>
                <p>Iedereen schrijft in stilte. Geen second opinion.</p>
              </div>
            </li>
            <li>
              <span className="flow-num">02</span>
              <div>
                <strong>Zie de antwoorden</strong>
                <p>De goede antwoorden komen op tafel. De rest blijft geheim.</p>
              </div>
            </li>
            <li>
              <span className="flow-num">03</span>
              <div>
                <strong>Zet in</strong>
                <p>Open, verhoog of pas. Je fiches verdwijnen direct in de pot.</p>
              </div>
            </li>
            <li>
              <span className="flow-num">04</span>
              <div>
                <strong>Onthul</strong>
                <p>De meeste juiste antwoorden claimen alles. Fout? Weg met je inzet.</p>
              </div>
            </li>
          </ol>

          <div className="hero-extras">
            <span>🌐 Online met tafelcode</span>
            <span>📝 Vier vragen per ronde</span>
            <span>👀 Antwoorden eerst, dan inzetten</span>
            <span>⚡ Shootout-finale</span>
          </div>
        </section>

        <section className="setup-card" aria-label="Spelinstellingen">
          <div className="setup-head">
            <p className="eyebrow">Tafelinstellingen</p>
            <h2>Neem plaats</h2>
          </div>

          <div className="field">
            <span className="field-label">Spelmodus</span>
            <div className="mode-grid mode-grid--four">
              {MODES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`mode-card ${mode === option.id ? 'is-selected' : ''}`}
                  onClick={() => setMode(option.id)}
                  aria-pressed={mode === option.id}
                >
                  <span className="mode-emoji" aria-hidden>
                    {option.emoji}
                  </span>
                  <span className="mode-name">{option.name}</span>
                  <span className="mode-sub">{option.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {isOnline ? (
            <div className="field online-setup">
              <span className="field-label">Jouw naam</span>
              <div className="name-grid name-grid--single">
                <label className="name-field">
                  <span>Speler</span>
                  <input
                    value={names[0]}
                    onChange={(event) => updateName(0, event.target.value)}
                    placeholder="Bijv. Hidde"
                    maxLength={18}
                    autoComplete="off"
                  />
                </label>
              </div>

              <div className="online-tabs" role="group" aria-label="Online tafel">
                <button
                  type="button"
                  className={onlineTab === 'create' ? 'is-selected' : ''}
                  onClick={() => setOnlineTab('create')}
                  aria-pressed={onlineTab === 'create'}
                >
                  Nieuwe tafel
                </button>
                <button
                  type="button"
                  className={onlineTab === 'join' ? 'is-selected' : ''}
                  onClick={() => setOnlineTab('join')}
                  aria-pressed={onlineTab === 'join'}
                >
                  Deelnemen
                </button>
              </div>

              {onlineTab === 'join' ? (
                <>
                  <label className="name-field online-code-field">
                    <span>Tafelcode</span>
                    <input
                      value={joinCode}
                      onChange={(event) =>
                        setJoinCode(normalizeRoomCode(event.target.value))
                      }
                      placeholder="ABCDE"
                      maxLength={5}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      inputMode="text"
                    />
                  </label>
                  <p className="field-note">
                    Vraag de code aan de host of open de uitnodigingslink. Je
                    komt in de wachtkamer tot de host start.
                  </p>
                </>
              ) : (
                <p className="field-note">
                  Jij bent de host. Kies de vragenset en het aantal rondes;
                  daarna deel je de code met je vriend.
                </p>
              )}
            </div>
          ) : (
            <div className="field">
              <span className="field-label">
                Spelers {humans < 3 && <em>· de rest zijn bots</em>}
              </span>
              <div className="name-grid">
                {Array.from({ length: humans }).map((_, index) => (
                  <label key={index} className="name-field">
                    <span>Speler {index + 1}</span>
                    <input
                      value={names[index]}
                      onChange={(event) => updateName(index, event.target.value)}
                      placeholder={`Speler ${index + 1}`}
                      maxLength={18}
                      autoComplete="off"
                    />
                  </label>
                ))}
              </div>
              {humans < 3 && (
                <p className="field-note">
                  De tafel vult de open stoelen met {humans === 1 ? 'twee bots' : 'een bot'}.
                </p>
              )}
            </div>
          )}

          {showSetupDetails && (
            <>
              <div className="field">
                <span className="field-label">Vragenset</span>
                <div className="deck-switch" role="group" aria-label="Vragenset">
                  {DECKS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={deck === option.id ? 'is-selected' : ''}
                      onClick={() => chooseDeck(option.id)}
                      aria-pressed={deck === option.id}
                    >
                      <strong>{option.name}</strong>
                      <span>{option.sub}</span>
                    </button>
                  ))}
                </div>
                <p className="field-note">
                  {deck === 'memes'
                    ? 'Alleen memevragen, uit één categorie. Maximaal zeven rondes.'
                    : 'De klassieke triviabank met zeven categorieën.'}
                </p>
              </div>

              <div className="field">
                <span className="field-label">Aantal rondes</span>
                <div className="segmented" role="group" aria-label="Aantal rondes">
                  {roundOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={rounds === option ? 'is-selected' : ''}
                      onClick={() => setRounds(option)}
                      aria-pressed={rounds === option}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {isOnline && onlineError && (
            <p className="field-error" role="alert">
              {onlineError}
            </p>
          )}

          <button
            type="button"
            className="btn btn--gold btn--lg btn--wide"
            onClick={submit}
            disabled={actionDisabled}
          >
            {isOnline
              ? onlineTab === 'create'
                ? onlineBusy
                  ? 'Tafel maken…'
                  : 'Tafel maken'
                : onlineBusy
                  ? 'Verbinden…'
                  : 'Aan tafel'
              : 'Neem plaats aan tafel'}
            <span aria-hidden>→</span>
          </button>
          <p className="fineprint">
            {isOnline
              ? 'Je vriend opent dezelfde site, kiest Online en vult de code in. Met z’n tweeën speel je zonder bot; een derde speler kan nog aanschuiven.'
              : 'Startbankroll € 750 per speler · 4 vragen per ronde · verplichte inzet € 10 / € 20 / € 40 / € 80.'}
          </p>
        </section>
      </main>

      <footer className="lobby-foot">
        <span>Geïnspireerd op de Nederlandse tv-klassieker</span>
        <span className="foot-rule" aria-hidden />
        <span>3 spelers · 1 pot · geen genade</span>
      </footer>
    </div>
  );
}
