import { useState } from 'react'
import { createRoom, joinRoom } from '../socket'
import { setStoredMode, setStoredQuizmasterName, setStoredPlayerName, setStoredRoomId } from '../storage'

console.log('[Lobby] Lobby module evaluated')

export default function Lobby({ onReady }) {
  const [mode, setMode] = useState('quizmaster')
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = () => {
    console.log('[Lobby] handleCreate called')
    if (!name.trim()) return
    console.log('[Lobby] handleCreate: name valid, calling createRoom')
    setCreating(true)
    createRoom(name, (roomId) => {
      console.log('[Lobby] handleCreate: createRoom callback', roomId)
      setStoredMode('quizmaster')
      setStoredQuizmasterName(name)
      setStoredRoomId(roomId)
      setCreating(false)
      onReady('quizmaster', roomId)
    })
  }

  const handleJoin = () => {
    console.log('[Lobby] handleJoin called')
    if (!name.trim() || !roomCode.trim()) return
    console.log('[Lobby] handleJoin: valid, calling joinRoom')
    setCreating(true)
    joinRoom(roomCode, name, () => {
      console.log('[Lobby] handleJoin: joinRoom callback')
      setStoredMode('player')
      setStoredPlayerName(name)
      setStoredRoomId(roomCode)
      setCreating(false)
      onReady('player', roomCode)
    })
  }

  let btnContent = null
  if (mode === 'quizmaster' && creating) {
    btnContent = <div className="fade-in">Roomp aanmaken...</div>
  } else if (mode === 'player' && creating) {
    btnContent = <div className="fade-in">Bezig met verbinden...</div>
  } else if (mode === 'quizmaster' && !creating) {
    btnContent = (
      <div style={{ marginTop: 20 }}>
        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          className="btn-primary"
        >
          Roomp aanmaken
        </button>
      </div>
    )
  } else if (mode === 'player' && !creating) {
    btnContent = (
      <div style={{ marginTop: 20 }}>
        <input
          className="input-enhanced"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value)}
          placeholder="Voer roomcode in"
        />
        <button
          onClick={handleJoin}
          disabled={!name.trim() || !roomCode.trim()}
          className="btn-primary"
        >
          Verbinden
        </button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', textAlign: 'center' }}>
      <h1>Met het Mes op Tafel</h1>
      <div style={{ marginBottom: 20 }}>
        <label>
          Speler naam:
          <input
            className="input-enhanced"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Voer voer je naam in"
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 20 }}>
        <button
          onClick={() => setMode('quizmaster')}
          className="btn-outline"
        >
          Quizmaster
        </button>
        <button
          onClick={() => setMode('player')}
          className="btn-outline"
        >
          Deelnemer
        </button>
      </div>
      {btnContent}
    </div>
  )
}