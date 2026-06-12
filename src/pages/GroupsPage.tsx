import { useState, useEffect, useRef, useMemo } from 'react'
import GroupTable from '../components/Groups/GroupTable'
import { loadTeams, loadDraw, loadScores, loadPlayers, resolveNames } from '../data/loaders'
import type { Team, DrawResult, ScoresData, Match, Player } from '../types'

function useCountdown(targetIso: string | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!targetIso) { setSecondsLeft(null); return }

    function tick() {
      const diff = Math.floor((new Date(targetIso!).getTime() - Date.now()) / 1000)
      setSecondsLeft(diff > 0 ? diff : 0)
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [targetIso])

  return secondsLeft
}

function formatCountdown(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60

  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${String(sec).padStart(2, '0')}s`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

const STAGE_LABELS: Record<string, string> = {
  GROUP: 'Group Stage', R32: 'Round of 32', R16: 'Round of 16',
  QF: 'Quarter-Final', SF: 'Semi-Final', F: 'Final',
}

function NextMatchBanner({ matches, teams, playerNames }: { matches: Match[]; teams: Team[]; playerNames: Record<string, string> }) {
  const liveMatch = matches.find(m => m.status === 'LIVE')
  const nextMatch = liveMatch ?? matches.find(m => (m.status === 'SCHEDULED' || m.status === 'TIMED') && new Date(m.date) > new Date())
  const secondsLeft = useCountdown((!liveMatch && nextMatch) ? nextMatch.date : null)

  if (!nextMatch) return null

  const home = teams.find(t => t.id === nextMatch.homeTeamId)
  const away = teams.find(t => t.id === nextMatch.awayTeamId)
  const homePlayer = nextMatch.homeTeamId ? playerNames[nextMatch.homeTeamId] : null
  const awayPlayer = nextMatch.awayTeamId ? playerNames[nextMatch.awayTeamId] : null
  const stageLabel = STAGE_LABELS[nextMatch.stage] ?? nextMatch.stage
  const groupLetter = nextMatch.group?.replace('GROUP_', '') ?? ''
  const groupSuffix = nextMatch.stage === 'GROUP' && groupLetter ? ` ${groupLetter}` : ''

  return (
    <div className={`mb-8 rounded-2xl border overflow-hidden ${liveMatch ? 'border-red-500/40 bg-red-500/5' : 'border-yellow-400/20 bg-yellow-400/5'}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-xs uppercase tracking-wider text-white/40">{stageLabel}{groupSuffix}</span>
        {liveMatch ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE NOW
          </span>
        ) : secondsLeft !== null ? (
          <span className="text-xs font-semibold text-yellow-400 tabular-nums">
            {secondsLeft === 0 ? 'Kicking off…' : `Kickoff in ${formatCountdown(secondsLeft)}`}
          </span>
        ) : null}
      </div>

      <div className="flex items-center px-4 py-3 gap-3">
        {/* Home */}
        <div className="flex-1 flex items-center gap-2.5 flex-row-reverse text-right">
          {home ? (
            <img src={home.flag} alt={home.name} className="w-9 h-6 object-cover rounded shrink-0" />
          ) : (
            <div className="w-9 h-6 rounded bg-white/10 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{home?.name ?? 'TBD'}</p>
            {homePlayer && <p className="text-xs text-white/40 truncate">{homePlayer}</p>}
          </div>
        </div>

        {/* Score or vs */}
        <div className="shrink-0 text-center min-w-[3.5rem]">
          {liveMatch && nextMatch.homeScore !== null ? (
            <div className="text-xl font-bold text-red-400 tabular-nums">
              {nextMatch.homeScore}<span className="text-white/30 mx-1">–</span>{nextMatch.awayScore}
            </div>
          ) : (
            <div className="text-white/30 text-sm font-medium">vs</div>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 flex items-center gap-2.5 text-left">
          {away ? (
            <img src={away.flag} alt={away.name} className="w-9 h-6 object-cover rounded shrink-0" />
          ) : (
            <div className="w-9 h-6 rounded bg-white/10 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{away?.name ?? 'TBD'}</p>
            {awayPlayer && <p className="text-xs text-white/40 truncate">{awayPlayer}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GroupsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadTeams(), loadDraw(), loadScores(), loadPlayers()]).then(([t, d, s, p]) => {
      setTeams(t)
      setDraw(d)
      setScores(s)
      setPlayers(p)
      setLoading(false)
    })
  }, [])

  const playerNames = useMemo(() => resolveNames(draw, players), [draw, players])

  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const drawEmpty = Object.keys(draw).length === 0
  const tournamentStarted = scores?.matches?.some(
    m => m.status === 'FINISHED' || m.status === 'LIVE'
  ) ?? false

  if (loading) {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading groups…</div></PageCenter>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Group Stage</h1>
        {scores?.lastUpdated && (
          <p className="text-white/40 text-sm">Last updated: {new Date(scores.lastUpdated).toLocaleString()}</p>
        )}
      </div>

      {scores?.matches && scores.matches.length > 0 && (
        <NextMatchBanner
          matches={scores.matches}
          teams={teams}
          playerNames={playerNames}
        />
      )}

      {drawEmpty && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-yellow-400/20 bg-yellow-400/5 text-yellow-400/80 text-sm">
          ⚠ The draw hasn't been run yet — team assignments will appear here after the draw ceremony.
        </div>
      )}

      {/* Find Me */}
      <div className="mb-8 max-w-sm">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Find me…"
          className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/50 transition-colors"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map(group => {
          const groupTeams = teams.filter(t => t.group === group)
          const standings = scores?.standings?.[`Group ${group}`] ?? null
          return (
            <GroupTable
              key={group}
              group={group}
              teams={groupTeams}
              playerNames={playerNames}
              standings={standings}
              highlight={search}
              tournamentStarted={tournamentStarted}
            />
          )
        })}
      </div>
    </div>
  )
}

function PageCenter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      {children}
    </div>
  )
}
