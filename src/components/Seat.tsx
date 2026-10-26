import { formatMoney } from '../game/engine';
import type { GameState, Player } from '../game/types';

function statusFor(state: GameState, player: Player, index: number): string {
  if (state.phase === 'answering') {
    if (state.answerStage === 'preview') return 'Leest mee';
    if (player.locked) return 'Briefje op slot';
    if (state.config?.simultaneous) {
      return player.isBot ? 'Schrijft…' : 'Vult in';
    }
    if (state.activeAnswerer === index) {
      return player.isBot ? 'Schrijft…' : 'Aan de beurt';
    }
    return 'Wacht';
  }

  if (state.phase === 'answerReveal') {
    return player.locked ? 'Briefje op slot' : 'Wacht';
  }

  if (state.phase === 'betting') {
    if (player.folded) return 'Past';
    if (state.currentBidder === index) return 'Aan zet';
    if (player.bet > 0) return `€ ${player.bet} ingezet`;
    return 'Wacht op inzet';
  }

  if (state.phase === 'reveal') {
    const count = player.correctCount ?? 0;
    if (player.folded) return `Gepast · ${count}/4 goed`;
    return `${count}/4 goed`;
  }

  if (state.phase === 'shootout' && state.shootout) {
    if (state.shootout.eliminated.includes(player.id)) return 'Uitgeschakeld';
    if (state.shootout.buzzedBy === player.id) return 'Aan het antwoorden';
    if (state.shootout.winnerId === player.id) return 'Shootout-winnaar';
    return state.shootout.stage === 'open' ? 'Klaar om te bellen' : 'Wacht op de bel';
  }

  return '';
}

export function Seat({
  state,
  player,
  index,
}: {
  state: GameState;
  player: Player;
  index: number;
}) {
  const isAnswering =
    state.phase === 'answering' &&
    state.answerStage === 'turn' &&
    (state.config?.simultaneous
      ? !player.locked
      : state.activeAnswerer === index);
  const isBidding = state.phase === 'betting' && state.currentBidder === index;
  const isBuzzing =
    state.phase === 'shootout' && state.shootout?.buzzedBy === player.id;
  const isWinner =
    state.phase === 'shootout' && state.shootout?.winnerId === player.id;
  const isEliminated =
    state.phase === 'shootout' &&
    Boolean(state.shootout?.eliminated.includes(player.id));
  const isFolded =
    (state.phase === 'betting' || state.phase === 'reveal') && player.folded;
  const isCorrect =
    state.phase === 'reveal' && (player.correctCount ?? 0) > 0 && !player.folded;
  const isWrong =
    state.phase === 'reveal' && (player.correctCount ?? 0) === 0 && !player.folded;
  const isLive = isAnswering || isBidding || isBuzzing || isWinner;

  const classes = [
    'seat',
    isLive ? 'seat--live' : '',
    isFolded ? 'seat--folded' : '',
    isCorrect ? 'seat--correct' : '',
    isWrong ? 'seat--wrong' : '',
    isEliminated ? 'seat--out' : '',
    player.isBot ? 'seat--bot' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} data-testid={`seat-${player.id}`}>
      <div className="seat-top">
        <span className="seat-avatar" aria-hidden>
          {player.avatar}
        </span>
        <div className="seat-id">
          <span className="seat-name">
            {player.name}
            {player.isBot && <span className="seat-bot">BOT</span>}
          </span>
          <span className="seat-status">{statusFor(state, player, index)}</span>
        </div>
      </div>

      <div className="seat-bottom">
        <span className="seat-bank">
          <span>Bankroll</span>
          <strong>{formatMoney(player.bankroll)}</strong>
        </span>
        {state.phase === 'betting' && !player.folded && player.bet > 0 && (
          <span className="seat-wager">€ {player.bet}</span>
        )}
        {isEliminated && <span className="seat-out-tag">ERUIT</span>}
      </div>
    </article>
  );
}
