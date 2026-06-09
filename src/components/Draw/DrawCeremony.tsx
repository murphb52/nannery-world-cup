import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import confetti from 'canvas-confetti'
import type { Team, DrawResult } from '../../types'
import GroupsBoard from './GroupsBoard'
import { exportGroupsPng } from '../../lib/exportPng'

type Phase = 'idle' | 'shuffling' | 'reveal-name' | 'reveal-team' | 'done'

interface Pairing {
  player: string
  team: Team
}

interface Props {
  players: string[]
  teams: Team[]
  onComplete: (result: DrawResult) => void
  isLiveMode?: boolean
  /** initial auto-advance speed multiplier */
  speedMultiplier?: number
  /** start playing automatically (otherwise wait on the Start button) */
  autoPlay?: boolean
  /** called when the user leaves the finished ceremony */
  onExit?: () => void
}

// Base timings (ms) for one pairing, divided by the speed multiplier.
const SHUFFLE_MS = 700   // slot-machine name cycling
const FLICKER_MS = 55    // how fast names flick during the shuffle
const NAME_HOLD = 450    // pause on the landed name
const TEAM_HOLD = 1300   // celebrate the team reveal
const GAP_MS = 250       // breather between pairings

const SPEEDS = [
  { label: '1×', value: 1 },
  { label: '1.5×', value: 1.5 },
  { label: '2×', value: 2 },
  { label: '3×', value: 3 },
]

const pickIndex = (len: number) => Math.floor(Math.random() * len)

export default function DrawCeremony({
  players,
  teams,
  onComplete,
  isLiveMode = false,
  speedMultiplier = 1.5,
  autoPlay = false,
  onExit,
}: Props) {
  const [remainingPlayers, setRemainingPlayers] = useState<string[]>(() => [...players])
  const [remainingTeams, setRemainingTeams] = useState<Team[]>(() => [...teams])
  const [completed, setCompleted] = useState<Pairing[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [flicker, setFlicker] = useState<string>('')
  const [running, setRunning] = useState(autoPlay)
  const [started, setStarted] = useState(autoPlay)
  const [speed, setSpeed] = useState(speedMultiplier)
  const [exporting, setExporting] = useState(false)

  const drawResult = useRef<DrawResult>({})
  const finishedRef = useRef(false)

  const total = players.length
  const done = completed.length

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    setRunning(false)
    setPhase('done')
    setCurrentPlayer(null)
    setCurrentTeam(null)
    confetti({ particleCount: 220, spread: 130, origin: { y: 0.5 } })
    confetti({ particleCount: 120, angle: 60, spread: 80, origin: { x: 0 } })
    confetti({ particleCount: 120, angle: 120, spread: 80, origin: { x: 1 } })
    onComplete(drawResult.current)
  }, [onComplete])

  const beginPairing = useCallback(() => {
    if (remainingPlayers.length === 0 || remainingTeams.length === 0) {
      finish()
      return
    }
    setStarted(true)
    setCurrentPlayer(remainingPlayers[pickIndex(remainingPlayers.length)])
    setFlicker(remainingPlayers[pickIndex(remainingPlayers.length)])
    setPhase('shuffling')
  }, [remainingPlayers, remainingTeams.length, finish])

  const revealTeam = useCallback(() => {
    if (remainingTeams.length === 0) return
    const team = remainingTeams[pickIndex(remainingTeams.length)]
    setCurrentTeam(team)
    setPhase('reveal-team')
    confetti({
      particleCount: 90,
      spread: 75,
      origin: { y: 0.55 },
      colors: ['#FFD700', '#FF4444', '#4488FF', '#44DD66', '#FF66CC'],
    })
  }, [remainingTeams])

  const confirmAndNext = useCallback(() => {
    if (!currentPlayer || !currentTeam) return
    drawResult.current[currentTeam.id] = currentPlayer
    setCompleted(prev => [...prev, { player: currentPlayer, team: currentTeam }])
    setRemainingPlayers(prev => prev.filter(p => p !== currentPlayer))
    setRemainingTeams(prev => prev.filter(t => t.id !== currentTeam.id))
    setCurrentPlayer(null)
    setCurrentTeam(null)
    setPhase('idle')
  }, [currentPlayer, currentTeam])

  // Slot-machine: flick through names while shuffling
  useEffect(() => {
    if (phase !== 'shuffling') return
    const id = setInterval(() => {
      setFlicker(remainingPlayers[pickIndex(remainingPlayers.length)] ?? '')
    }, Math.max(28, FLICKER_MS / speed))
    return () => clearInterval(id)
  }, [phase, remainingPlayers, speed])

  // Shuffling always auto-locks onto the chosen name (the flourish), even in manual mode
  useEffect(() => {
    if (phase !== 'shuffling') return
    const t = setTimeout(() => setPhase('reveal-name'), SHUFFLE_MS / speed)
    return () => clearTimeout(t)
  }, [phase, speed])

  // Auto-advance the remaining transitions while playing
  useEffect(() => {
    if (!running) return
    let t: ReturnType<typeof setTimeout>
    if (phase === 'idle') {
      t = setTimeout(beginPairing, GAP_MS / speed)
    } else if (phase === 'reveal-name') {
      t = setTimeout(revealTeam, NAME_HOLD / speed)
    } else if (phase === 'reveal-team') {
      t = setTimeout(confirmAndNext, TEAM_HOLD / speed)
    } else {
      return
    }
    return () => clearTimeout(t)
  }, [running, phase, speed, beginPairing, revealTeam, confirmAndNext])

  const manualNext = useCallback(() => {
    if (phase === 'idle') beginPairing()
    else if (phase === 'reveal-name') revealTeam()
    else if (phase === 'reveal-team') confirmAndNext()
    // 'shuffling' is mid-flourish — ignore
  }, [phase, beginPairing, revealTeam, confirmAndNext])

  const skipToEnd = useCallback(() => {
    setRunning(false)
    const shuffledPlayers = [...remainingPlayers].sort(() => Math.random() - 0.5)
    const shuffledTeams = [...remainingTeams].sort(() => Math.random() - 0.5)
    // Fold in whatever's mid-reveal so nothing is lost
    if (currentPlayer && currentTeam) drawResult.current[currentTeam.id] = currentPlayer
    const leftoverPlayers = currentPlayer ? shuffledPlayers.filter(p => p !== currentPlayer) : shuffledPlayers
    const leftoverTeams = currentTeam ? shuffledTeams.filter(t => t.id !== currentTeam.id) : shuffledTeams
    const n = Math.min(leftoverPlayers.length, leftoverTeams.length)
    for (let i = 0; i < n; i++) drawResult.current[leftoverTeams[i].id] = leftoverPlayers[i]
    finish()
  }, [remainingPlayers, remainingTeams, currentPlayer, currentTeam, finish])

  async function handleExport() {
    setExporting(true)
    try {
      await exportGroupsPng(teams, drawResult.current)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // Live assignment map (includes the team currently being revealed)
  const assignments = useMemo(() => {
    const a: Record<string, string> = {}
    completed.forEach(p => { a[p.team.id] = p.player })
    if (currentTeam && currentPlayer && phase === 'reveal-team') a[currentTeam.id] = currentPlayer
    return a
  }, [completed, currentTeam, currentPlayer, phase])

  // ── Finished screen ────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-6xl mx-auto px-2">
        <div className="text-center pt-2">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-3xl sm:text-4xl font-bold text-yellow-400 mb-1">The Draw is Complete!</h2>
          <p className="text-white/60">All {done} players have their teams — let the games begin.</p>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-black font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {exporting ? 'Generating…' : '📸 Download PNG'}
          </button>
          {onExit && (
            <button
              onClick={onExit}
              className="px-5 py-2.5 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/10 transition-all"
            >
              Done
            </button>
          )}
        </div>
        {isLiveMode && <p className="text-green-400/80 text-xs">✓ Results saved to the repository</p>}

        <div className="w-full">
          {/* Read the authoritative result ref so Skip-to-results is reflected too */}
          <GroupsBoard teams={teams} assignments={drawResult.current} />
        </div>
      </div>
    )
  }

  // ── Start screen ───────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center gap-8 min-h-[55vh] text-center px-4">
        <div>
          <div className="text-5xl mb-4">🎲</div>
          <h2 className="text-3xl font-bold text-white mb-2">Ready for the Draw</h2>
          <p className="text-white/50">{total} players · {teams.length} teams · ~{Math.ceil((total * 2.7) / speed / 60)} min</p>
        </div>

        <div>
          <p className="text-sm text-white/40 mb-3 uppercase tracking-wider">Pace</p>
          <div className="flex gap-2 justify-center">
            {SPEEDS.map(s => (
              <button
                key={s.value}
                onClick={() => setSpeed(s.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  speed === s.value
                    ? 'bg-yellow-400/20 text-yellow-400 border border-yellow-400/30'
                    : 'border border-white/20 text-white/60 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={() => { setStarted(true); setRunning(true) }}
            className="px-10 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-red-500 text-black font-bold text-lg hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-yellow-500/20"
          >
            🎲 Start the Draw
          </button>
          <button
            onClick={() => { setStarted(true); setRunning(false); beginPairing() }}
            className="text-white/40 hover:text-white/70 text-sm transition-colors"
          >
            or step through it manually
          </button>
        </div>
      </div>
    )
  }

  // ── Live ceremony ──────────────────────────────────────────────────
  const showName = phase === 'shuffling' || phase === 'reveal-name' || phase === 'reveal-team'
  const nameText = phase === 'shuffling' ? flicker : currentPlayer

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-6xl mx-auto px-2">
      {/* Progress + controls */}
      <div className="w-full max-w-2xl">
        <div className="flex justify-between text-sm text-white/50 mb-2">
          <span>Draw Progress</span>
          <span className="tabular-nums">{done} / {total}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-red-500 transition-all duration-300"
            style={{ width: `${(done / total) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-center flex-wrap gap-3 mt-4">
          <button
            onClick={() => setRunning(r => !r)}
            className={`px-4 py-1.5 rounded-full text-sm border transition-all ${
              running ? 'border-yellow-400/50 text-yellow-400 bg-yellow-400/10' : 'border-white/20 text-white/60 hover:text-white'
            }`}
          >
            {running ? '⏸ Pause' : '▶ Play'}
          </button>
          {!running && (
            <button
              onClick={manualNext}
              disabled={phase === 'shuffling'}
              className="px-4 py-1.5 rounded-full text-sm border border-white/20 text-white/70 hover:bg-white/10 disabled:opacity-40 transition-all"
            >
              Next ▸
            </button>
          )}
          <div className="flex gap-1">
            {SPEEDS.map(s => (
              <button
                key={s.value}
                onClick={() => setSpeed(s.value)}
                className={`px-2.5 py-1 rounded text-xs transition-all ${
                  speed === s.value ? 'text-yellow-400 font-semibold' : 'text-white/30 hover:text-white/60'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={skipToEnd}
            className="px-4 py-1.5 rounded-full text-sm border border-white/15 text-white/40 hover:text-white/80 transition-all"
          >
            Skip to results ⏭
          </button>
        </div>
      </div>

      {/* Main stage */}
      <div className="w-full max-w-2xl min-h-[15rem] rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center p-6 gap-4 overflow-hidden">
        {showName ? (
          <>
            <div className="text-center">
              <p className="text-white/40 text-xs uppercase tracking-[0.25em] mb-2">
                {phase === 'shuffling' ? 'Drawing…' : 'Next up'}
              </p>
              <p
                className={`font-bold text-white leading-tight transition-all ${
                  phase === 'shuffling'
                    ? 'text-3xl sm:text-4xl opacity-70 blur-[0.5px]'
                    : 'text-4xl sm:text-5xl scale-105'
                }`}
              >
                {nameText}
              </p>
            </div>

            {phase === 'reveal-team' && currentTeam && (
              <div className="flex flex-col items-center gap-2 animate-[fadeIn_0.4s_ease]">
                <span className="text-white/30 text-2xl leading-none">↓</span>
                <img
                  src={currentTeam.flag}
                  alt={currentTeam.name}
                  className="w-28 h-[4.5rem] object-cover rounded-lg shadow-2xl border border-white/20"
                />
                <p className="text-2xl font-bold text-yellow-400">{currentTeam.name}</p>
                <p className="text-white/50 text-sm">Group {currentTeam.group}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-white/40 text-lg">Pairing locked in — drawing next…</p>
        )}
      </div>

      {/* Live groups board */}
      <div className="w-full">
        <h3 className="text-xs text-white/40 mb-2 uppercase tracking-wider text-center">Groups</h3>
        <GroupsBoard
          teams={teams}
          assignments={assignments}
          highlightTeamId={phase === 'reveal-team' ? currentTeam?.id : null}
        />
      </div>
    </div>
  )
}
