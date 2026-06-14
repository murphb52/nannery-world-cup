import { useState, useEffect, useMemo } from 'react'
import { loadTeams, loadScores } from '../data/loaders'
import { useSweepstakes } from '../contexts/SweepstakesContext'
import type { Team, Match, Player } from '../types'

const STAGE_LABELS: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Final', SF: 'Semi-Final', F: 'Final',
}

function stageLabel(m: Match): string {
  if (m.stage === 'GROUP') return m.group ? `Group ${m.group.replace('GROUP_', '')}` : 'Group Stage'
  return STAGE_LABELS[m.stage] ?? m.stage
}

function kickoffTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function matchDateLabel(iso: string): string {
  const key = new Date(iso).toLocaleDateString('en-CA')
  const [y, mo, d] = key.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function PlayersPage() {
  const { players, draw } = useSweepstakes()
  const [teams, setTeams] = useState<Team[]>([])
  const [matches, setMatches] = useState<Match[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  useEffect(() => {
    Promise.all([loadTeams(), loadScores()]).then(([t, s]) => {
      setTeams(t)
      setMatches([...(s.matches ?? [])].sort((a, b) => a.date.localeCompare(b.date)))
      setLoading(false)
    })
  }, [])

  // Map playerId → all their teams (supports multiple teams per player)
  const teamsByPlayerId = useMemo(() => {
    const map = new Map<string, Team[]>()
    for (const [teamId, playerId] of Object.entries(draw)) {
      const team = teams.find(t => t.id === teamId)
      if (!team) continue
      const existing = map.get(playerId) ?? []
      map.set(playerId, [...existing, team])
    }
    return map
  }, [draw, teams])

  const teamById = useMemo(() => {
    const map = new Map<string, Team>()
    for (const t of teams) map.set(t.id, t)
    return map
  }, [teams])

  useEffect(() => {
    if (!selectedPlayer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedPlayer(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPlayer])

  if (loading) {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading players…</div></PageCenter>
  }

  const drawDone = teamsByPlayerId.size > 0

  const filtered = players
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  const selectedTeams = selectedPlayer ? (teamsByPlayerId.get(selectedPlayer.id) ?? []) : []
  const selectedTeamIds = new Set(selectedTeams.map(t => t.id))
  const selectedMatches = matches.filter(m => selectedTeamIds.has(m.homeTeamId) || selectedTeamIds.has(m.awayTeamId))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Players</h1>
        <p className="text-white/40 text-sm">{players.length} players in the draw</p>
      </div>

      <div className="mb-8 max-w-sm">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Find me…"
          className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-yellow-400/50 transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-white/30 text-sm">No players match "{search}".</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(player => {
            const playerTeams = teamsByPlayerId.get(player.id) ?? []
            const primaryTeam = playerTeams[0] ?? null
            return (
              <button
                key={player.id}
                onClick={() => setSelectedPlayer(player)}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left w-full transition-all hover:border-white/25 hover:bg-white/10 active:scale-[0.98] cursor-pointer"
              >
                <div className="flex gap-1 shrink-0">
                  {playerTeams.length > 0 ? playerTeams.map(t => (
                    <img key={t.id} src={t.flag} alt={t.name} className="w-10 h-7 object-cover rounded" />
                  )) : (
                    <div className="w-10 h-7 rounded bg-white/5 border border-white/10" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{player.name}</p>
                  {primaryTeam ? (
                    <p className="text-xs text-white/50 truncate">
                      {playerTeams.map(t => t.name).join(' · ')}
                    </p>
                  ) : (
                    <p className="text-xs text-white/30">
                      {drawDone ? 'No team assigned' : 'Awaiting the draw'}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selectedPlayer && (
        <PlayerModal
          player={selectedPlayer}
          teams={selectedTeams}
          matches={selectedMatches}
          teamById={teamById}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  )
}

function PlayerModal({ player, teams, matches, teamById, onClose }: {
  player: Player
  teams: Team[]
  matches: Match[]
  teamById: Map<string, Team>
  onClose: () => void
}) {
  const completed = matches.filter(m => m.status === 'FINISHED')
  const upcoming = matches.filter(m => m.status !== 'FINISHED')
  const teamIds = new Set(teams.map(t => t.id))

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg bg-[#1a1f2e] border border-white/15 rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex gap-1 shrink-0">
            {teams.length > 0 ? teams.map(t => (
              <img key={t.id} src={t.flag} alt={t.name} className="w-10 h-7 object-cover rounded" />
            )) : (
              <div className="w-10 h-7 rounded bg-white/10" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-lg leading-tight">{player.name}</p>
            {teams.length > 0 ? (
              <p className="text-sm text-white/50">{teams.map(t => `${t.name} (Grp ${t.group})`).join(' · ')}</p>
            ) : (
              <p className="text-sm text-white/30">No team assigned</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition-colors ml-2 shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {matches.length === 0 && (
            <p className="text-white/30 text-sm text-center py-8">No fixtures found.</p>
          )}

          {completed.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-white/30 mb-3 font-semibold">Results</h3>
              <div className="space-y-2">
                {completed.map(m => (
                  <ModalMatchRow key={m.id} match={m} focusTeamIds={teamIds} teamById={teamById} />
                ))}
              </div>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h3 className="text-xs uppercase tracking-wider text-white/30 mb-3 font-semibold">Upcoming</h3>
              <div className="space-y-2">
                {upcoming.map(m => (
                  <ModalMatchRow key={m.id} match={m} focusTeamIds={teamIds} teamById={teamById} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function ModalMatchRow({ match, focusTeamIds, teamById }: {
  match: Match
  focusTeamIds: Set<string>
  teamById: Map<string, Team>
}) {
  const home = teamById.get(match.homeTeamId) ?? null
  const away = teamById.get(match.awayTeamId) ?? null
  const finished = match.status === 'FINISHED' && match.homeScore !== null && match.awayScore !== null
  const live = match.status === 'LIVE'
  const hasScore = match.homeScore !== null && match.awayScore !== null
  const homeWon = finished && match.homeScore! > match.awayScore!
  const awayWon = finished && match.awayScore! > match.homeScore!

  // If the player owns both teams in this match, just use home perspective
  const focusIsHome = focusTeamIds.has(match.homeTeamId)
  const opponentTeam = focusIsHome ? away : home
  const focusWon = focusIsHome ? homeWon : awayWon
  const focusLost = focusIsHome ? awayWon : homeWon
  const focusScore = focusIsHome ? match.homeScore : match.awayScore
  const oppScore = focusIsHome ? match.awayScore : match.homeScore

  // Both teams are owned by this player
  const bothOwned = focusTeamIds.has(match.homeTeamId) && focusTeamIds.has(match.awayTeamId)

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <span className="text-[11px] uppercase tracking-wider text-white/35">{stageLabel(match)}</span>
        <span className="text-[11px] text-white/35">{matchDateLabel(match.date)}</span>
      </div>
      {bothOwned ? (
        <div className="flex items-center gap-2 px-3 py-2.5">
          {home && <img src={home.flag} alt={home.name} className="w-8 h-[22px] object-cover rounded shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{home?.name ?? 'TBD'} vs {away?.name ?? 'TBD'}</p>
            <p className="text-[11px] text-yellow-400/70">Both your teams! · {kickoffTime(match.date)}</p>
          </div>
          {away && <img src={away.flag} alt={away.name} className="w-8 h-[22px] object-cover rounded shrink-0" />}
          {hasScore && (
            <span className="text-sm font-bold text-white tabular-nums shrink-0">{match.homeScore} – {match.awayScore}</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 px-3 py-2.5">
          {opponentTeam ? (
            <img
              src={opponentTeam.flag}
              alt={opponentTeam.name}
              className={`w-8 h-[22px] object-cover rounded shrink-0 ${focusLost ? 'grayscale opacity-60' : ''}`}
            />
          ) : (
            <div className="w-8 h-[22px] rounded bg-white/10 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold truncate ${focusLost ? 'text-white/40' : 'text-white'}`}>
              vs {opponentTeam?.name ?? 'TBD'}
            </p>
            <p className="text-[11px] text-white/35">
              {focusIsHome ? 'Home' : 'Away'} · {kickoffTime(match.date)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {live ? (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-bold text-red-400 tabular-nums">{focusScore} – {oppScore}</span>
              </div>
            ) : hasScore ? (
              <span className={`text-sm font-bold tabular-nums ${focusWon ? 'text-yellow-400' : focusLost ? 'text-white/40' : 'text-white'}`}>
                {focusScore} – {oppScore}
              </span>
            ) : (
              <span className="text-xs text-white/30">–</span>
            )}
          </div>
        </div>
      )}
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
