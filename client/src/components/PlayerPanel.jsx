import { useEffect, useState } from 'react'
import {
  playerBet,
  playerPass,
  playerSubmitAnswer,
  shootoutAnswer as submitShootoutAnswer,
  getSocket,
  onStateUpdate,
  offStateUpdate
} from '../socket'

function Countdown ({ endsAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!endsAt) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [endsAt])
  if (!endsAt) return null
  const secs = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return <span className="status-badge status-turn" style={{ marginLeft: 8 }}>⏱ {secs}s</span>
}

export default function PlayerPanel({ roomId }) {
  const [state, setState] = useState(null)
  const [myAnswer, setMyAnswer] = useState('')
  const [shootoutAnswer, setShootoutAnswer] = useState('')

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_room', { roomId, name: 'Deelnemer', role: 'player' })
    const onUpdate = (s) => setState(s)
    onStateUpdate(onUpdate)
    return () => offStateUpdate(onUpdate)
  }, [roomId])

  if (!state) return <div className="fade-in">Laden...</div>

  const me = state.players.find(p => p.id === getSocket().id) || state.players[0]
  const canBet = state.phase === 'BETTING' || state.phase === 'LAST_RAISE'
  const canPass = state.phase === 'BETTING' || state.phase === 'LAST_RAISE'
  const canAnswer = state.phase === 'QUESTIONS'

  const betButtons = [10, 20, 30, 40, 50]

  // Check if it's this player's turn to act (simplified - in this game, multiple can act simultaneously)
  const isMyTurnToBet = canBet && !me.eliminated;
  const isMyTurnToAnswer = canAnswer && !me.eliminated;
  const isInShootout = state.phase === 'SHOOTOUT' && state.shootoutCandidates.includes(me.id);

  return (
    <div className="fade-in" style={{ padding: 20, maxWidth: 600, margin: '20px auto' }}>
      <h1>Deelnemer — {me.name}</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p>Je geld: <strong>€{me.money}</strong></p>
          <p>Ronde {state.round}/7</p>
        </div>
        <div>
          <p>Fase: <span className="status-badge {state.phase === 'QUESTIONS' && isMyTurnToAnswer ? 'status-turn' : ''}">{state.phase.replace(/_/g, ' ')}</span><Countdown endsAt={state.phaseEndsAt} /></p>
        </div>
      </div>

      {state.phase === 'BETTING_MANDATORY' && (
        <div style={{ marginTop: 16, background: 'rgba(13,202,240,0.1)', padding: 16, borderRadius: 8 }}>
          <p>Verplichte begininzet: <strong>€{state.mandatoryBet}</strong>. Gelieve in te zetten of te passen.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <button 
              onClick={() => playerBet(state.mandatoryBet)} 
              disabled={me.money < state.mandatoryBet || me.eliminated}
              className="btn-primary"
            >
              Inzet €{state.mandatoryBet}
            </button>
            <button 
              onClick={() => playerPass()} 
              disabled={me.eliminated}
              className="btn-outline"
            >
              Ik trek mij terug
            </button>
          </div>
          {isMyTurnToBet && (
            <div style={{ marginTop: 8, fontSize: 14, color: '#198754' }}>
              ✓ Aan jou de beurt om te wedden
            </div>
          )}
        </div>
      )}

      {canBet && (
        <div style={{ marginTop: 16 }}>
          <p>Hoogste inzet nu: <strong>€{state.highestBet}</strong>. Jij kunt max +50 boven jouw huidige inzet zetten.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            {betButtons.map(b => (
              <button 
                key={b} 
                disabled={me.money < b || b < 10 || me.eliminated} 
                onClick={() => playerBet(b)} 
                className="btn-outline"
              >
                +€{b}
              </button>
            ))}
            <button 
              onClick={() => playerPass()} 
              disabled={me.eliminated}
              className="btn-outline"
            >
              Passen
            </button>
          </div>
          {isMyTurnToBet && (
            <div style={{ marginTop: 8, fontSize: 14, color: '#198754' }}>
              ✓ Aan jou de beurt om te wedden
            </div>
          )}
        </div>
      )}

      {canAnswer && (
        <div style={{ marginTop: 16, background: '#f8f9fa', padding: 16, borderRadius: 8 }}>
          <h3>Vraag {state.currentQ + 1} van 4</h3>
          <p><strong>{state.questions[state.currentQ]?.question}</strong></p>
          <p style={{ fontSize: 14, color: '#666' }}>Categorie: {state.questions[state.currentQ]?.category}</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <input
              className="input-enhanced"
              value={myAnswer}
              onChange={e => setMyAnswer(e.target.value)}
              placeholder="Jouw antwoord"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button 
              onClick={() => { 
                if (myAnswer.trim()) {
                  playerSubmitAnswer(myAnswer);
                  setMyAnswer('');
                }
              }} 
              disabled={me.eliminated || !myAnswer.trim()}
              className="btn-primary"
            >
              Antwoord indienen
            </button>
          </div>
          {isMyTurnToAnswer && (
            <div style={{ marginTop: 8, fontSize: 14, color: '#198754' }}>
              ✓ Aan jou de beurt om te antwoorden
            </div>
          )}
          {state.phase === 'ANSWERS_REVEAL' && (
            <div style={{ marginTop: 12, background: 'rgba(25,135,84,0.1)', padding: 12, borderRadius: 6 }}>
              Antwoorden worden door quizmaster getoond.
            </div>
          )}
        </div>
      )}

      {state.phase === 'SHOOTOUT' && state.shootoutCandidates.includes(me.id) && (
        <div style={{ marginTop: 16, background: 'rgba(255,193,7,0.1)', padding: 16, borderRadius: 8, animation: 'pulse 2s infinite' }}>
          <h3>Shoot-out! Druk snel en geef antwoord</h3>
          <p><strong>{state.questions[state.shootoutQ]?.question}</strong></p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <input
              className="input-enhanced"
              value={shootoutAnswer}
              onChange={e => setShootoutAnswer(e.target.value)}
              placeholder="Jouw antwoord"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button
              onClick={() => { 
                if (shootoutAnswer.trim()) {
                  submitShootoutAnswer(shootoutAnswer);
                  setShootoutAnswer('');
                }
              }} 
              disabled={me.eliminated || !shootoutAnswer.trim()}
              className="btn-danger"
            >
              ANTWOORD GEVEN
            </button>
          </div>
          <p style={{ marginTop: 12, fontSize: 14, color: '#dc3545', fontWeight: 'bold' }}>
            ⚠️ Schuifel niet! Geef alleen antwoord als je de snelste bent.
          </p>
        </div>
      )}

      {state.phase === 'GAME_OVER' && (
        <div style={{ marginTop: 16 }}>
          <h2>Spel afgelopen</h2>
          {state.winnerId === me.id && (
            <div style={{ background: 'rgba(25,135,84,0.1)', padding: 16, borderRadius: 8, marginTop: 12, animation: 'pulse 3s infinite' }}>
              <p style={{ fontWeight: 'bold', color: '#198754', fontSize: 18, margin: 0 }}>
                🎉 Jij wint! €{me.money}
              </p>
            </div>
          )}
          {state.winnerId !== me.id && (
            <div style={{ background: 'rgba(13,202,240,0.1)', padding: 16, borderRadius: 8, marginTop: 12 }}>
              <p style={{ color: '#666', margin: 0 }}>
                Winnaar: {state.players.find(p => p.id === state.winnerId)?.name}
              </p>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <h3>Je antwoorden dit spel</h3>
        {state.playerAnswers?.[me.id]?.length > 0 ? (
          <div style={{ background: '#f8f9fa', padding: 12, borderRadius: 8 }}>
            <ul style={{ margin: 0, paddingLeft: 24 }}>
              {state.playerAnswers[me.id]?.map((a, i) => (
                <li key={i} style={{ marginBottom: 4, padding: 6, background: 'white', borderRadius: 4 }}>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p style={{ color: '#666', fontStyle: 'italic' }}>Nog geen antwoorden.</p>
        )}
      </div>
    </div>
  )
}
