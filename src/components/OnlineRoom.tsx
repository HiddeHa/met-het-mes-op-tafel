import { useState } from 'react';
import { DECK_LABELS, formatMoney } from '../game/engine';
import type { RoomView } from '../net/protocol';
import { Brand } from './Brand';
import { HeaderActions } from './HeaderActions';

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  return Promise.reject(new Error('Clipboard unavailable'));
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * A host who opened the game on localhost gets an invite link that only works
 * on their own machine. Swap in the server's LAN address so the link is usable
 * from another PC on the same network.
 */
function resolveShareUrl(
  inviteUrl: string | null,
  lanHost: string | null,
): { url: string | null; overNetwork: boolean } {
  if (!inviteUrl) return { url: null, overNetwork: false };
  try {
    const parsed = new URL(inviteUrl);
    if (!LOOPBACK_HOSTS.has(parsed.hostname) || !lanHost) {
      return { url: inviteUrl, overNetwork: false };
    }
    parsed.hostname = lanHost;
    return { url: parsed.toString(), overNetwork: true };
  } catch {
    return { url: inviteUrl, overNetwork: false };
  }
}

export function OnlineRoom({
  room,
  youId,
  connected,
  error,
  inviteUrl,
  onStart,
  onLeave,
  soundOn,
  onToggleSound,
  onOpenRules,
}: {
  room: RoomView;
  youId: string | null;
  connected: boolean;
  error: string | null;
  inviteUrl: string | null;
  onStart: () => void;
  onLeave: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenRules: () => void;
}) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const share = resolveShareUrl(inviteUrl, room.lanHost);
  const host = room.players.find((player) => player.isHost);
  const isHost = Boolean(youId && room.hostId === youId);
  const canStart = connected && isHost && room.players.length >= room.minPlayers;
  const emptySeats = Math.max(0, room.maxPlayers - room.players.length);

  function copy(value: string | null, kind: 'code' | 'link') {
    if (!value) return;
    void copyText(value)
      .then(() => {
        setCopied(kind);
        window.setTimeout(() => setCopied(null), 1800);
      })
      .catch(() => {
        setCopied(null);
      });
  }

  if (room.started) {
    return (
      <div className="online-room">
        <div className="game-glow" aria-hidden />
        <header className="online-room-top">
          <Brand compact />
          <HeaderActions
            soundOn={soundOn}
            onToggleSound={onToggleSound}
            onOpenRules={onOpenRules}
          />
        </header>
        <main className="online-room-main">
          <section className="room-card room-card--starting">
            <span className="room-starting-mark" aria-hidden>🃏</span>
            <p className="eyebrow">Tafel {room.code}</p>
            <h2>De briefjes worden uitgedeeld</h2>
            <p>Even geduld — de eerste vier vragen komen eraan.</p>
            <span className="thinking-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="online-room">
      <div className="game-glow" aria-hidden />
      <header className="online-room-top">
        <Brand compact />
        <div className="online-room-top-right">
          <span className={`connection-chip ${connected ? 'is-live' : 'is-offline'}`}>
            <i aria-hidden />
            {connected ? 'Verbonden' : 'Opnieuw verbinden…'}
          </span>
          <HeaderActions
            soundOn={soundOn}
            onToggleSound={onToggleSound}
            onOpenRules={onOpenRules}
          />
        </div>
      </header>

      <main className="online-room-main">
        <section className="room-card" aria-label={`Online tafel ${room.code}`}>
          <header className="room-head">
            <div>
              <p className="eyebrow">Online tafel</p>
              <h2>Nodig je vriend uit</h2>
            </div>
            <span className="room-seat-count">
              {room.players.length}/{room.maxPlayers} spelers
            </span>
          </header>

          <div className="room-code-block">
            <div>
              <span className="field-label">Tafelcode</span>
              <strong className="room-code">{room.code}</strong>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => copy(room.code, 'code')}
            >
              {copied === 'code' ? 'Gekopieerd ✓' : 'Kopieer code'}
            </button>
          </div>

          <label className="room-invite">
            <span className="field-label">Uitnodigingslink</span>
            <div className="room-invite-row">
              <input
                readOnly
                value={share.url ?? ''}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="Uitnodigingslink"
              />
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => copy(share.url, 'link')}
              >
                {copied === 'link' ? 'Gekopieerd ✓' : 'Kopieer link'}
              </button>
            </div>
            <small>
              {share.overNetwork
                ? 'Je vriend opent deze link op je eigen netwerk (zelfde Wi-Fi) en zit meteen aan tafel.'
                : room.lanHost
                  ? 'Je vriend opent deze link of vult de code in bij Online → Deelnemen.'
                  : 'Open de site via je netwerkadres (ipconfig) als je vriend op een andere pc meespeelt.'}
            </small>
          </label>

          <div className="room-players" aria-label="Spelers aan tafel">
            {Array.from({ length: room.maxPlayers }).map((_, index) => {
              const player = room.players[index];
              if (!player) {
                return (
                  <div className="room-player room-player--empty" key={`empty-${index}`}>
                    <span className="room-player-avatar" aria-hidden>＋</span>
                    <div>
                      <strong>Open stoel</strong>
                      <small>
                        {room.players.length === 2 && index === 2
                          ? 'Blijft leeg — jullie spelen met z’n tweeën'
                          : 'Wacht op een speler'}
                      </small>
                    </div>
                  </div>
                );
              }
              const self = player.id === youId;
              return (
                <div
                  className={`room-player ${self ? 'is-self' : ''} ${
                    player.connected ? '' : 'is-offline'
                  }`}
                  key={player.id}
                >
                  <span className="room-player-avatar" aria-hidden>
                    {player.avatar}
                  </span>
                  <div>
                    <strong>
                      {player.name}
                      {self && <em>jij</em>}
                    </strong>
                    <small>
                      {player.isHost ? 'Host' : 'Speler'} ·{' '}
                      {player.connected ? 'aan tafel' : 'offline'}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="room-settings">
            <span>
              {room.deck === 'memes' ? '🃏' : '📚'} {DECK_LABELS[room.deck]}
            </span>
            <span>{room.rounds} rondes · 4 vragen per ronde</span>
            <span>Startbankroll {formatMoney(750)}</span>
          </div>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          {isHost ? (
            <div className="room-actions">
              <button
                type="button"
                className="btn btn--gold btn--lg btn--wide"
                disabled={!canStart}
                onClick={onStart}
              >
                {room.players.length < room.minPlayers
                  ? 'Wacht op je tweede speler'
                  : 'Start het spel'}
                <span aria-hidden>→</span>
              </button>
              <p className="room-note">
                {room.players.length >= room.maxPlayers
                  ? 'Volle tafel: jullie spelen met z’n drieën.'
                  : 'Met z’n tweeën speel je zonder bot. Een derde speler kan nog aanschuiven.'}
              </p>
            </div>
          ) : (
            <div className="room-actions">
              <div className="room-waiting">
                <span className="thinking-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  Wachten tot <strong>{host?.name ?? 'de host'}</strong> de tafel
                  opent.
                </span>
              </div>
            </div>
          )}

          <div className="room-footer">
            <button type="button" className="link-btn" onClick={onLeave}>
              Verlaat tafel
            </button>
            <span className="room-footer-note">
              {emptySeats > 0 ? `${emptySeats} stoel${emptySeats === 1 ? '' : 'en'} vrij` : 'Tafel vol'}
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
