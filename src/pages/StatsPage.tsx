import { useState, useEffect, useMemo } from 'react'
import { loadTeams, loadScores, resolveNames } from '../data/loaders'
import { useSweepstakes } from '../contexts/SweepstakesContext'
import type { Team, ScoresData } from '../types'

function goalTotals(scores: ScoresData): Record<string, { for: number; against: number }> {
  const totals: Record<string, { for: number; against: number }> = {}
  for (const m of scores.matches ?? []) {
    if (m.status !== 'FINISHED' || m.homeScore == null || m.awayScore == null) continue
    const home = (totals[m.homeTeamId] ??= { for: 0, against: 0 })
    const away = (totals[m.awayTeamId] ??= { for: 0, against: 0 })
    home.for += m.homeScore
    home.against += m.awayScore
    away.for += m.awayScore
    away.against += m.homeScore
  }
  return totals
}

interface LeaderboardEntry {
  teamId: string
  value: number
  label: string
  rank: number
}

function withRanks(entries: Omit<LeaderboardEntry, 'rank'>[]): LeaderboardEntry[] {
  return entries.map((entry, _, arr) => ({
    ...entry,
    rank: arr.findIndex(e => e.value === entry.value) + 1,
  }))
}

interface LeaderboardCardProps {
  icon: string
  title: string
  entries: LeaderboardEntry[]
  teams: Team[]
  playerNames: Record<string, string>
  higherIsBetter?: boolean
}

function LeaderboardCard({ icon, title, entries, teams, playerNames }: LeaderboardCardProps) {
  const isEmpty = entries.length === 0

  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-500/15 to-red-500/15 px-4 py-3 border-b border-white/10 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-bold text-white text-sm">{title}</h3>
      </div>

      {isEmpty ? (
        <div className="px-4 py-6 text-center text-white/30 text-sm">
          No data yet
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {entries.map((entry) => {
            const team = teams.find(t => t.id === entry.teamId)
            if (!team) return null
            const player = playerNames[entry.teamId]
            const isFirst = entry.rank === 1
            const isTied = entries.filter(e => e.rank === entry.rank).length > 1

            return (
              <div
                key={entry.teamId}
                className={`flex items-center gap-3 px-4 py-2.5 ${isFirst ? 'bg-yellow-400/5' : ''}`}
              >
                <span className={`text-xs font-bold w-5 shrink-0 text-right ${
                  entry.rank === 1 ? 'text-yellow-400' : entry.rank === 2 ? 'text-white/50' : entry.rank === 3 ? 'text-orange-400/70' : 'text-white/25'
                }`}>
                  {isTied ? `=${entry.rank}` : entry.rank}
                </span>
                <img
                  src={team.flag}
                  alt={team.name}
                  className="w-8 h-5 object-cover rounded shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{team.name}</p>
                  {player && <p className="text-xs text-white/40 truncate">{player}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <span className={`text-sm font-bold tabular-nums ${isFirst ? 'text-yellow-400' : 'text-white/70'}`}>
                    {entry.value}
                  </span>
                  <span className="text-xs text-white/30 ml-1">{entry.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function StatsPage() {
  const { players, draw } = useSweepstakes()
  const [teams, setTeams] = useState<Team[]>([])
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadTeams(), loadScores()]).then(([t, s]) => {
      setTeams(t)
      setScores(s)
      setLoading(false)
    })
  }, [])

  const playerNames = useMemo(() => resolveNames(draw, players), [draw, players])

  const stats = useMemo(() => {
    if (!scores) return null

    const goals = goalTotals(scores)
    const finishedMatches = (scores.matches ?? []).filter(
      m => m.status === 'FINISHED' && m.homeScore != null && m.awayScore != null
    )
    const totalGoals = finishedMatches.reduce(
      (sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0
    )
    const avgGoals = finishedMatches.length > 0
      ? (totalGoals / finishedMatches.length).toFixed(2)
      : null

    const topScorers: LeaderboardEntry[] = withRanks(
      Object.entries(goals)
        .filter(([, t]) => t.for > 0)
        .sort((a, b) => b[1].for - a[1].for)
        .slice(0, 5)
        .map(([teamId, t]) => ({ teamId, value: t.for, label: 'goals' }))
    )

    const bestDefence: LeaderboardEntry[] = withRanks(
      Object.entries(goals)
        .filter(([, t]) => t.against >= 0)
        .sort((a, b) => a[1].against - b[1].against || b[1].for - a[1].for)
        .slice(0, 5)
        .map(([teamId, t]) => ({ teamId, value: t.against, label: 'conceded' }))
    )

    const yellowCards: LeaderboardEntry[] = withRanks(
      Object.entries(scores.cards ?? {})
        .filter(([, c]) => c.yellow > 0)
        .sort((a, b) => b[1].yellow - a[1].yellow)
        .slice(0, 5)
        .map(([teamId, c]) => ({ teamId, value: c.yellow, label: 'yellows' }))
    )

    const redCards: LeaderboardEntry[] = withRanks(
      Object.entries(scores.cards ?? {})
        .filter(([, c]) => c.red > 0)
        .sort((a, b) => b[1].red - a[1].red)
        .slice(0, 5)
        .map(([teamId, c]) => ({ teamId, value: c.red, label: 'reds' }))
    )

    const winsByTeam: Record<string, number> = {}
    for (const group of Object.values(scores.standings ?? {})) {
      for (const s of group) {
        winsByTeam[s.teamId] = (winsByTeam[s.teamId] ?? 0) + s.won
      }
    }
    const mostWins: LeaderboardEntry[] = withRanks(
      Object.entries(winsByTeam)
        .filter(([, w]) => w > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([teamId, w]) => ({ teamId, value: w, label: 'wins' }))
    )

    return {
      totalGoals,
      matchesPlayed: finishedMatches.length,
      avgGoals,
      topScorers,
      bestDefence,
      yellowCards,
      redCards,
      mostWins,
    }
  }, [scores])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="text-white/50 animate-pulse">Loading stats…</div>
      </div>
    )
  }

  const hasData = stats && stats.matchesPlayed > 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Tournament Stats</h1>
        {scores?.lastUpdated && (
          <p className="text-white/40 text-sm">Last updated: {new Date(scores.lastUpdated).toLocaleString()}</p>
        )}
      </div>

      {hasData && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          {[
            { label: 'Goals Scored', value: stats.totalGoals },
            { label: 'Matches Played', value: stats.matchesPlayed },
            { label: 'Avg Goals / Game', value: stats.avgGoals ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/3 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-yellow-400 tabular-nums">{value}</p>
              <p className="text-xs text-white/40 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {!hasData && (
        <div className="mb-8 rounded-xl border border-white/10 bg-white/3 px-6 py-8 text-center text-white/40 text-sm">
          Stats will appear here once matches start being played.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <LeaderboardCard
          icon="⚽"
          title="Most Goals Scored"
          entries={stats?.topScorers ?? []}
          teams={teams}
          playerNames={playerNames}
        />
        <LeaderboardCard
          icon="🛡️"
          title="Best Defence"
          entries={stats?.bestDefence ?? []}
          teams={teams}
          playerNames={playerNames}
        />
        <LeaderboardCard
          icon="🟨"
          title="Most Yellow Cards"
          entries={stats?.yellowCards ?? []}
          teams={teams}
          playerNames={playerNames}
        />
        {(stats?.redCards?.length ?? 0) > 0 && (
          <LeaderboardCard
            icon="🟥"
            title="Most Red Cards"
            entries={stats?.redCards ?? []}
            teams={teams}
            playerNames={playerNames}
          />
        )}
        <LeaderboardCard
          icon="🏅"
          title="Most Wins"
          entries={stats?.mostWins ?? []}
          teams={teams}
          playerNames={playerNames}
        />
      </div>
    </div>
  )
}
