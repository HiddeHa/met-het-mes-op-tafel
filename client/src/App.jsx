import { useState } from 'react'
import Lobby from './components/Lobby'
import QuizmasterPanel from './components/QuizmasterPanel'
import PlayerPanel from './components/PlayerPanel'

export default function App() {
  const [role, setRole] = useState(null)
  const [roomId, setRoomId] = useState(null)

  const handleReady = (r, rid) => {
    setRole(r)
    setRoomId(rid || null)
  }

  return (
    <>
      {role === null ? <Lobby onReady={handleReady} /> :
       role === 'quizmaster' && roomId ? <QuizmasterPanel roomId={roomId} /> :
       role === 'player' && roomId ? <PlayerPanel roomId={roomId} /> :
       <Lobby onReady={handleReady} />}
    </>
  )
}
