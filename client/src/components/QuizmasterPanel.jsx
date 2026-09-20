import { useEffect, useState } from 'react'
import {
  phaseAdvance,
  revealAnswers,
  declareScore,
  resolveRound,
  startShootout,
  startGame,
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

export default function QuizmasterPanel ({ roomId }) {
  const [state, setState] = useState(null)
  const [scoreInput, setScoreInput] = useState({})
  const [shootoutReady, setShootoutReady] = useState(false)

  useEffect(() => {
    const socket = getSocket()
    socket.emit('join_room', { roomId, name: 'Quizmaster', role: 'quizmaster' })
    const onUpdate = (s) => setState(s)
    onStateUpdate(onUpdate)
    return () => offStateUpdate(onUpdate)
  }, [roomId])

  if (!state) return <div className="fade-in">Laden...</div>

  const players = state.players
  const activePlayers = players.filter(p => !p.eliminated)

  const handleStartGame = () => startGame()
  const handleAdvance = () => phaseAdvance()
  const handleReveal = () => revealAnswers()
  const handleDeclare = () => {
    Object.entries(scoreInput).forEach(([id, count]) => {
      if (count >= 0) declareScore({ playerId: id, count })
    })
  }
  const handleResolve = () => resolveRound()
  const handleStartShootout = () => {
    const tied = players.filter(p => p.id).map(p => p.id)
    if (tied.length >= 2) startShootout(tied)
  }

  // Determine whose turn it is (if applicable)
  const getCurrentTurnPlayer = () => {
    // In QUESTIONS phase, we could show who answered first, etc.
    // For now, we'll highlight the first player as a ceremonial role
    if (state.firstPlayerId) {
      return players.find(p => p.id === state.firstPlayerId)
    }
    return null
  }

  return (
    <div className="fade-in" style={{ padding: 20, maxWidth: 700, margin: '20px auto' }}>
      <h1>Quizmaster — {roomId}</h1>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p>Ronde {state.round}/7</p>
          <p>Pot: <strong>€{state.pot}</strong></p>
        </div>
        <div>
          <p>Fase: <span className="status-badge status-turn">{state.phase.replace(/_/g, ' ')}</span><Countdown endsAt={state.phaseEndsAt} /></p>
        </div>
      </div>

      {state.phase === 'LOBBY' && (
        <div style={{ marginTop: 16 }}>
          <button 
            onClick={handleStartGame} 
            disabled={activePlayers.length < 1} 
            className="btn-primary"
          >
            Spel starten ({activePlayers.length} deelnemers)
          </button>
        </div>
      )}

      {state.phase !== 'LOBBY' && state.phase !== 'GAME_OVER' && (
        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button 
            onClick={handleAdvance} 
            className="btn-primary"
          >
            {state.phase === 'QUESTIONS' ? 'Volgende vraag' : 'Volgende fase'}
          </button>
          {state.phase === 'ANSWERS_REVEAL' && (
            <button 
              onClick={handleReveal} 
              className="btn-success"
            >
              Antwoorden tonen
            </button>
          )}
          {state.phase === 'LAST_RAISE' && (
            <button 
              onClick={handleResolve} 
              className="btn-success"
            >
              Ronde afhandelen
            </button>
          )}
        </div>
      )}

      {state.phase === 'SCORE_DECLARATION' && (
        <div style={{ marginTop: 16 }}>
          <h3>Goede antwoorden per deelnemer (eerste hand deelt eerst)</h3>
          {activePlayers.map(p => (
            <div key={p.id} 
            className="fade-in"
            style={{ marginBottom: 12, padding: 12, background: '#f8f9fa', borderRadius: 8 }}
          >
              <span>{p.name}: </span>
              <input
                type="number"
                min={0}
                max={4}
                value={scoreInput[p.id] ?? 0}
                onChange={e => setScoreInput(prev => ({ ...prev, [p.id]: Number(e.target.value) }))}
                className="input-enhanced"
                style={{ width: 80 }}
              />
            </div>
          ))}
          <button 
            onClick={handleDeclare} 
            className="btn-primary"
            style={{ marginTop: 8 }}
          >
            Bevestigen
          </button>
        </div>
      )}

      {state.phase === 'LAST_RAISE' && (
        <div style={{ marginTop: 16, background: 'rgba(13,202,240,0.1)', padding: 16, borderRadius: 8 }}>
           <p>Deelnemers kunnen nu nog een laatste keer bijsituren (10–50).</p>
         </div>
      )}

      {state.phase === 'RESOLVE' && (
        <div style={{ marginTop: 16 }}>
          <p>Gelijke score? Kies de kandidaten voor shoot-out.</p>
          <button 
            onClick={handleStartShootout} 
            disabled={activePlayers.length < 2} 
            className="btn-warning"
          >
            Shoot-out starten
          </button>
        </div>
      )}

      {state.phase === 'SHOOTOUT' && (
        <div style={{ marginTop: 16, background: 'rgba(255,193,7,0.1)', padding: 16, borderRadius: 8 }}>
          <h3>Shoot-out vraag {state.shootoutQ + 1}</h3>
          <p><strong>{state.questions[state.shootoutQ]?.question}</strong></p>
          <p style={{ fontSize: 14, color: '#212529' }}>
            Wie het snelste op de knop drukt, geeft antwoord via de deelnemer-client.
          </p>
          <div style={{ marginTop: 12 }}>
            <button 
              onClick={() => {}} 
              className="btn-outline"
              style={{ padding: '12px 24px' }}
            >
              Wachten op antwoord...
            </button>
          </div>
        </div>
      )}

      {state.phase === 'GAME_OVER' && (
        <div style={{ marginTop: 16 }}>
          <h2>Spel afgelopen</h2>
          {state.winnerId && (
            <div style={{ background: 'rgba(25,135,84,0.1)', padding: 16, borderRadius: 8, marginTop: 12 }}>
              <p style={{ fontWeight: 'bold', color: '#198754', margin: 0 }}>
                Winnaar: {players.find(p => p.id === state.winnerId)?.name} 
                (<strong>€{players.find(p => p.id === state.winnerId)?.money}</strong>)
              </p>
            </div>
          )}
        </div>
      )}

      <h3 style={{ marginTop: 24 }}>Deelnemers</h3>
      <table className="table-enhanced">
        <thead>
          <tr>
            <th>Naam</th>
            <th>Geld</th>
            <th>Inzet</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {players.map(p => {
            const isFirstPlayer = p.id === state.firstPlayerId;
            const isCurrentTurn = getCurrentTurnPlayer() && getCurrentTurnPlayer().id === p.id;
            
            return (
              <tr 
                key={p.id} 
                className={isCurrentTurn ? 'status-turn' : ''}
                style={{ 
                  backgroundColor: 'rgba(13,202,240,0.1)',
                  transition: 'background-color 0.3s ease'
                }}
              >
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isFirstPlayer && <span style={{ background: '#0dcaf0', color: 'white', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>⭐</span>}
                    <span>{p.name}</span>
                  </div>
                </td>
                <td>€{p.money}</td>
                <td>€{p.bets[state.round - 1] ?? 0}</td>
                <td>
                  {p.eliminated ? (
                    <span className="status-badge status-eliminated">Uit</span>
                  ) : (
                    <span className="status-badge status-active">Actief</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Vragen deze ronde</h3>
      {state.questions.length > 0 && state.phase === 'QUESTIONS' && (
        <div style={{ marginTop: 24, background: '#f8f9fa', padding: 16, borderRadius: 8 }}>
          <h3>Vragen deze ronde (vraag {state.currentQ + 1} van 4)</h3>
          {state.questions.slice(0, 4).map((q, i) => (
            <div 
              key={i} 
              className="fade-in"
              style={{
                marginBottom: 16,
                padding: 12,
                background: i === state.currentQ ? '#fff3cd' : 'white',
                borderRadius: 6,
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                border: i === state.currentQ ? '2px solid #ffc107' : '2px solid transparent'
              }}
            >
              <strong>{i + 1}. {q.question}</strong>
              {i === state.currentQ && <span style={{ marginLeft: 8, fontSize: 12, color: '#856404' }}>← huidige vraag</span>}
              <div style={{ fontSize: 14, color: '#666', marginTop: 4 }}>Categorie: {q.category}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}