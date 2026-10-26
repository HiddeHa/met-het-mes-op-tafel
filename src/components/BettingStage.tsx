import { useState, type Dispatch } from 'react';
import {
  BET_SECONDS,
  BET_STEP,
  MAX_BET,
  MIN_BET,
  formatMoney,
  getBidLimits,
} from '../game/engine';
import type { GameAction, GameState } from '../game/types';
import type { OnlineGameMeta } from '../net/protocol';
import { TimerBar } from './TimerBar';

export function BettingStage({
  state,
  dispatch,
  online,
}: {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  online?: OnlineGameMeta;
}) {
  const limits = getBidLimits(state);
  const [raise, setRaise] = useState(limits?.minRaise ?? MIN_BET);

  if (state.currentBidder === null || !limits) return null;
  const bidder = state.players[state.currentBidder];
  const isMyBid = !online || bidder.id === online.youId;
  const raiseAmount = Math.max(
    limits.minRaise,
    Math.min(raise, limits.maxTotal),
  );
  const topBettor = state.players.find(
    (player) => player.bet === state.highestBet && player.bet > 0,
  );
  const activeBidders = state.players.filter((player) => !player.folded);
  const presets = Array.from(
    new Set([limits.minRaise, limits.minRaise + 10, limits.minRaise + 20, limits.maxTotal]),
  ).filter(
    (amount) =>
      amount >= limits.minRaise &&
      amount <= limits.maxTotal &&
      amount > state.highestBet,
  );

  return (
    <section className="stage stage--betting">
      <header className="stage-head">
        <div>
          <p className="eyebrow">Fase 3 · Inzetronde</p>
          <h2>
            {bidder.isBot
              ? `${bidder.name} weegt de inzet af`
              : isMyBid
                ? `Jouw inzet, ${bidder.name}`
                : `${bidder.name} is aan zet`}
          </h2>
        </div>
        <TimerBar value={state.timeLeft} max={BET_SECONDS} label="Inzettijd" />
      </header>

      <div className="bid-table" aria-label="Inzetten aan tafel">
        {state.players.map((player, index) => (
          <div
            key={player.id}
            className={`bid-row ${player.folded ? 'is-folded' : ''} ${
              index === state.currentBidder ? 'is-bidder' : ''
            }`}
          >
            <span className="bid-player">
              <span className="bid-avatar" aria-hidden>
                {player.avatar}
              </span>
              <span>
                <strong>{player.name}</strong>
                <small>{player.folded ? 'Past' : 'Antwoorden bekend'}</small>
              </span>
            </span>
            <span className={`bid-amount ${player.bet === 0 ? 'is-zero' : ''}`}>
              {player.folded ? '—' : formatMoney(player.bet)}
            </span>
          </div>
        ))}
      </div>

      <div className="bid-highlight">
        <span>Hoogste inzet</span>
        <strong>{state.highestBet > 0 ? formatMoney(state.highestBet) : 'Nog niets'}</strong>
        <span className="bid-highlight-note">
          {state.highestBet === state.roundStake
            ? `verplichte inzet van alle spelers`
            : topBettor
              ? `van ${topBettor.name}`
              : 'de tafel wacht op een verhoging'}
        </span>
      </div>

      {activeBidders.length === 1 && (
        <p className="bid-warning bid-warning--gold">
          Alle anderen hebben gepast. {bidder.name} kan de inzet nog verhogen of
          alsnog passen.
        </p>
      )}

      {bidder.isBot || !isMyBid ? (
        <div className="thinking-panel" aria-live="polite">
          <span className="thinking-avatar" aria-hidden>
            {bidder.avatar}
          </span>
          <div>
            <strong>
              {bidder.isBot
                ? `${bidder.name} kijkt naar de pot…`
                : `${bidder.name} is aan zet`}
            </strong>
            <p>
              {bidder.isBot
                ? 'Ze kent haar eigen antwoorden — past ze of gaat ze mee?'
                : `Wachten tot ${bidder.name} verhoogt, meegaat of past.`}
            </p>
          </div>
          <span className="thinking-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : (
        <div className="bid-controls">
          <div className="bid-own">
            <div>
              <span>Jouw bankroll</span>
              <strong>{formatMoney(bidder.bankroll)}</strong>
            </div>
            <div>
              <span>Al ingezet</span>
              <strong>{formatMoney(bidder.bet)}</strong>
            </div>
            <div>
              <span>Ruimte</span>
              <strong>{formatMoney(limits.maxTotal - bidder.bet)}</strong>
            </div>
          </div>

          <div className="bet-actions">
            {!limits.canCall && limits.canRaise && (
              <p className="bid-warning bid-warning--gold">
                Je verplichte inzet staat al in de pot. Verhoog met minimaal{' '}
                {formatMoney(MIN_BET)} of pas.
              </p>
            )}

            {limits.canCall && (
              <button
                type="button"
                className="btn btn--ghost btn--bet"
                onClick={() => dispatch({ type: 'callBet' })}
              >
                Meegaan · {formatMoney(limits.callCost)}
                {limits.callTarget < state.highestBet && (
                  <small>all-in</small>
                )}
              </button>
            )}

            {limits.canRaise && (
              <div className="raise-panel">
                <div className="raise-display">
                  <span>{state.highestBet === 0 ? 'Open de pot met' : 'Verhoog naar'}</span>
                  <strong>{formatMoney(raiseAmount)}</strong>
                </div>
                <input
                  className="bet-slider"
                  type="range"
                  min={limits.minRaise}
                  max={limits.maxTotal}
                  step={BET_STEP}
                  value={raiseAmount}
                  onChange={(event) => setRaise(Number(event.target.value))}
                  aria-label="Inzetbedrag"
                />
                <div className="bet-presets">
                  {presets.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={raiseAmount === amount ? 'is-selected' : ''}
                      onClick={() => setRaise(amount)}
                    >
                      € {amount}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--gold btn--wide"
                  onClick={() => dispatch({ type: 'placeBet', amount: raiseAmount })}
                >
                  {state.highestBet === 0
                    ? `Open de inzet · ${formatMoney(raiseAmount)}`
                    : `Verhoog · ${formatMoney(raiseAmount)}`}
                </button>
              </div>
            )}

            {!limits.canCall && !limits.canRaise && (
              <p className="bid-warning">
                Je hebt te weinig fiches om in te zetten. Je kunt alleen passen.
              </p>
            )}

            <button
              type="button"
              className="btn btn--danger"
              onClick={() => dispatch({ type: 'foldBet' })}
            >
              Pas
            </button>
          </div>
        </div>
      )}

      <p className="bid-rules">
        De antwoorden liggen op tafel, dus je weet hoe je zelf deed — de briefjes
        van de anderen blijven dicht. De verplichte inzet van{' '}
        {formatMoney(state.roundStake)} per speler staat al in de pot. Verhoog
        met stappen van {formatMoney(MIN_BET)}; deze ronde kun je tot{' '}
        {formatMoney(state.roundStake + MAX_BET)} gaan. De speler met de meeste
        goede antwoorden claimt de pot. Passen betekent: je inzet blijft liggen,
        maar je maakt geen aanspraak meer.
      </p>
    </section>
  );
}
