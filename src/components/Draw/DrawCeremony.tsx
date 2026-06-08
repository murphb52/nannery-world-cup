import { useState, useEffect, useRef, useCallback } from 'react'
import confetti from 'canvas-confetti'
import type { Team, DrawResult } from '../../types'
import NameReveal from './NameReveal'
import TeamReveal from './TeamReveal'

type DrawPhase = 'idle' | 'name' | 'team' | 'pair-done'

interface Pairing {
  player: string
  team: Team
}

interface Props {
  players: string[]
  teams: Team[]
  onComplete: (result: DrawResult) => void
  isLiveMode: boolean
  speedMultiplier: number
  autoPlay: boolean
}

export default function DrawCeremony({ players, teams, onComplete, isLiveMode, speedMultiplier, autoPlay }: Props) {
  const [remainingPlayers, setRemainingPlayers] = useState<string[]>([...players])
  const [remainingTeams, setRemainingTeams] = useState<Team[]>([...teams])
  const [completedPairings, setCompletedPairings] = useState<Pairing[]>([])
  const [phase, setPhase] = useState<DrawPhase>('idle')
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [isFinished, setIsFinished] = useState(false)
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawResult = useRef<DrawResult>({})

  const stepDuration = Math.round(1200 / speedMultiplier)

  const clearTimer = () => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current)
      autoTimer.current = null
    }
  }

  const pickPlayer = useCallback(() => {
    if (remainingPlayers.length === 0) return
    const idx = Math.floor(Math.random() * remainingPlayers.length)
    const player = remainingPlayers[idx]
    setCurrentPlayer(player)
    setRemainingPlayers(prev => prev.filter((_, i) => i !== idx))
    setPhase('name')
  }, [remainingPlayers])

  const pickTeam = useCallback(() => {
    if (remainingTeams.length === 0 || !currentPlayer) return
    const idx = Math.floor(Math.random() * remainingTeams.length)
    const team = remainingTeams[idx]
    setCurrentTeam(team)
    setRemainingTeams(prev => prev.filter((_, i) => i !== idx))
    setPhase('team')

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FFD700', '#FF4444', '#4444FF', '#44FF44', '#FF44FF'],
    })
  }, [remainingTeams, currentPlayer])

  const confirmPair = useCallback(() => {
    if (!currentPlayer || !currentTeam) return
    drawResult.current[currentTeam.id] = currentPlayer
    setCompletedPairings(prev => [...prev, { player: currentPlayer, team: currentTeam }])
    setPhase('pair-done')
    setCurrentPlayer(null)
    setCurrentTeam(null)
  }, [currentPlayer, currentTeam])

  const advance = useCallback(() => {
    if (phase === 'idle' || phase === 'pair-done') {
      if (remainingPlayers.length === 0) {
        setIsFinished(true)
        onComplete(drawResult.current)
        confetti({ particleCount: 200, spread: 120, origin: { y: 0.5 } })
        return
      }
      pickPlayer()
    } else if (phase === 'name') {
      pickTeam()
    } else if (phase === 'team') {
      confirmPair()
    }
  }, [phase, remainingPlayers.length, pickPlayer, pickTeam, confirmPair, onComplete])

  // Auto-advance
  useEffect(() => {
    if (!autoPlay || isFinished) return
    clearTimer()
    autoTimer.current = setTimeout(() => advance(), stepDuration)
    return clearTimer
  }, [autoPlay, phase, isFinished, advance, stepDuration])

  const total = players.length
  const done = completedPairings.length

  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="text-6xl mb-6">🎉</div>
        <h2 className="text-4xl font-bold text-yellow-400 mb-3">The Draw is Complete!</h2>
        <p className="text-xl text-white/70 mb-8">Let the Games Begin!</p>
        {isLiveMode && (
          <p className="text-green-400 text-sm">✓ Results saved to repository</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-8 max-w-2xl mx-auto w-full">
      {/* Progress */}
      <div className="w-full">
        <div className="flex justify-between text-sm text-white/50 mb-2">
          <span>Draw Progress</span>
          <span>{done} / {total}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-red-500 transition-all duration-500"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Main stage */}
      <div className="w-full min-h-64 rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center p-8 gap-6">
        {phase === 'idle' || phase === 'pair-done' ? (
          <p className="text-white/40 text-lg">
            {done === 0 ? 'Ready to begin the draw' : 'Pairing complete — draw next'}
          </p>
        ) : null}

        {(phase === 'name' || phase === 'team') && currentPlayer && (
          <NameReveal name={currentPlayer} />
        )}

        {phase === 'team' && currentTeam && (
          <TeamReveal team={currentTeam} />
        )}
      </div>

      {/* Controls */}
      {!autoPlay && (
        <button
          onClick={advance}
          className="px-8 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-black font-bold text-lg hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-yellow-500/20"
        >
          {phase === 'idle' || phase === 'pair-done'
            ? done === 0 ? '🎲 Start Draw' : '🎲 Draw Next'
            : phase === 'name' ? '🏳️ Reveal Team' : '✓ Confirm Pairing'}
        </button>
      )}

      {/* Recent pairings */}
      {completedPairings.length > 0 && (
        <div className="w-full">
          <h3 className="text-sm text-white/40 mb-2 uppercase tracking-wider">Recent Draws</h3>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {[...completedPairings].reverse().slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 text-sm">
                <img src={p.team.flag} alt={p.team.name} className="w-8 h-5 object-cover rounded" />
                <span className="text-yellow-400 font-medium">{p.player}</span>
                <span className="text-white/40">→</span>
                <span className="text-white/80">{p.team.name}</span>
                <span className="ml-auto text-white/30 text-xs">Group {p.team.group}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
