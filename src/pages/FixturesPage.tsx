import { useState, useEffect, useMemo, useRef } from 'react'
import { loadTeams, loadDraw, loadScores } from '../data/loaders'
import type { Team, DrawResult, Match } from '../types'

const STAGE_LABELS: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-Final',
  SF: 'Semi-Final',
  F: 'Final',
}

function stageLabel(m: Match): string {
  if (m.stage === 'GROUP') return m.group ? `Group ${m.group}` : 'Group Stage'
  return STAGE_LABELS[m.stage] ?? m.stage
}

// Local YYYY-MM-DD key for grouping matches into calendar days.
function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA')
}

function dayLabel(key: string): string {
  // key is YYYY-MM-DD in local time; reconstruct a local Date for formatting
  const [y, mo, d] = key.split('-').map(Number)
  const date = new Date(y, mo - 1, d)
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function kickoffTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function FixturesPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [matches, setMatches] = useState<Match[]>([])
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dayOverride, setDayOverride] = useState<string | null>(null)

  const todayChipRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    Promise.all([loadTeams(), loadDraw(), loadScores()]).then(([t, d, s]) => {
      setTeams(t)
      setDraw(d)
      setMatches([...(s.matches ?? [])].sort((a, b) => a.date.localeCompare(b.date)))
      setLastUpdated(s.lastUpdated)
      setLoading(false)
    })
  }, [])

  const teamById = useMemo(() => {
    const map = new Map<string, Team>()
    for (const t of teams) map.set(t.id, t)
    return map
  }, [teams])

  // Unique match days in chronological order
  const days = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const m of matches) {
      const k = dayKey(m.date)
      if (!seen.has(k)) { seen.add(k); out.push(k) }
    }
    return out
  }, [matches])

  const todayKey = new Date().toLocaleDateString('en-CA')

  // Default to today, else the next upcoming match day, else the most recent.
  // Derived so it tracks the loaded data without a setState-in-effect.
  const defaultDay = useMemo(() => {
    if (days.length === 0) return null
    if (days.includes(todayKey)) return todayKey
    return days.find(d => d >= todayKey) ?? days[days.length - 1]
  }, [days, todayKey])

  const selectedDay = dayOverride ?? defaultDay

  // Bring the Today chip into view in the horizontal strip
  useEffect(() => {
    todayChipRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [days])

  const dayMatches = useMemo(
    () => matches.filter(m => dayKey(m.date) === selectedDay),
    [matches, selectedDay]
  )

  if (loading) {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading fixtures…</div></PageCenter>
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Fixtures</h1>
        {lastUpdated
          ? <p className="text-white/40 text-sm">Last updated: {new Date(lastUpdated).toLocaleString()}</p>
          : <p className="text-white/40 text-sm">Kick-off times shown in your local time</p>}
      </div>

      {matches.length === 0 ? (
        <div className="mt-12 text-center">
          <div className="text-5xl mb-4">📅</div>
          <h2 className="text-xl font-bold text-white mb-2">No fixtures yet</h2>
          <p className="text-white/50 max-w-sm mx-auto">
            The match schedule will appear here once the tournament data is published. Check back closer to kick-off.
          </p>
        </div>
      ) : (
        <>
          {/* Find me */}
          <div className="mb-5 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Find me…"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/50 transition-colors"
            />
          </div>

          {/* Day strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-3 mb-2">
            {days.map(d => {
              const isToday = d === todayKey
              const isActive = d === selectedDay
              return (
                <button
                  key={d}
                  ref={isToday ? todayChipRef : undefined}
                  onClick={() => setDayOverride(d)}
                  className={`flex flex-col items-center px-4 py-2 rounded-xl border whitespace-nowrap shrink-0 transition-all ${
                    isActive
                      ? 'bg-yellow-400/20 border-yellow-400/40 text-yellow-400'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/30'
                  }`}
                >
                  <span className="text-sm font-semibold">{dayLabel(d)}</span>
                  {isToday && <span className="text-[10px] uppercase tracking-wider mt-0.5">Today</span>}
                </button>
              )
            })}
          </div>

          {/* Matches for the selected day */}
          <div className="flex flex-col gap-3 mt-4">
            {dayMatches.map(m => (
              <FixtureRow
                key={m.id}
                match={m}
                home={teamById.get(m.homeTeamId) ?? null}
                away={teamById.get(m.awayTeamId) ?? null}
                homePlayer={draw[m.homeTeamId] ?? null}
                awayPlayer={draw[m.awayTeamId] ?? null}
                highlight={search.trim().toLowerCase()}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FixtureRow({ match, home, away, homePlayer, awayPlayer, highlight }: {
  match: Match
  home: Team | null
  away: Team | null
  homePlayer: string | null
  awayPlayer: string | null
  highlight: string
}) {
  const finished = match.status === 'FINISHED' && match.homeScore !== null && match.awayScore !== null
  const live = match.status === 'LIVE'
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const homeWon = finished && match.homeScore! > match.awayScore!
  const awayWon = finished && match.awayScore! > match.homeScore!

  const isHit = (name: string | null, team: Team | null) =>
    !!highlight && (
      (name?.toLowerCase().includes(highlight) ?? false) ||
      (team?.name.toLowerCase().includes(highlight) ?? false)
    )
  const matched = isHit(homePlayer, home) || isHit(awayPlayer, away)
  const dimmed = highlight && !matched

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all ${
      matched ? 'border-yellow-400/40 bg-yellow-400/5' : 'border-white/10 bg-white/5'
    } ${dimmed ? 'opacity-40' : ''}`}>
      {/* Header: stage + status */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <span className="text-xs uppercase tracking-wider text-white/40">{stageLabel(match)}</span>
        {live ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE
          </span>
        ) : finished ? (
          <span className="text-xs font-semibold text-white/40">FT</span>
        ) : (
          <span className="text-xs font-semibold text-white/50">{kickoffTime(match.date)}</span>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-center px-4 py-3 gap-3">
        <TeamSide team={home} player={homePlayer} won={homeWon} lost={awayWon} align="right" />

        <div className="shrink-0 text-center min-w-[3.5rem]">
          {hasScore ? (
            <div className={`text-xl font-bold tabular-nums ${live ? 'text-red-400' : 'text-white'}`}>
              {match.homeScore}<span className="text-white/30 mx-1">–</span>{match.awayScore}
            </div>
          ) : (
            <div className="text-white/30 text-sm font-medium">vs</div>
          )}
        </div>

        <TeamSide team={away} player={awayPlayer} won={awayWon} lost={homeWon} align="left" />
      </div>
    </div>
  )
}

function TeamSide({ team, player, won, lost, align }: {
  team: Team | null
  player: string | null
  won: boolean
  lost: boolean
  align: 'left' | 'right'
}) {
  const right = align === 'right'
  return (
    <div className={`flex-1 min-w-0 flex items-center gap-2.5 ${right ? 'flex-row-reverse text-right' : 'text-left'}`}>
      {team ? (
        <img
          src={team.flag}
          alt={team.name}
          className={`w-9 h-6 object-cover rounded shrink-0 ${lost ? 'grayscale opacity-60' : ''}`}
        />
      ) : (
        <div className="w-9 h-6 rounded bg-white/10 shrink-0" />
      )}
      <div className="min-w-0">
        <p className={`text-sm font-semibold truncate ${won ? 'text-yellow-400' : lost ? 'text-white/50' : 'text-white'}`}>
          {team?.name ?? 'TBD'}
        </p>
        <p className="text-xs text-white/40 truncate">{player ?? '—'}</p>
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
