import { useState, useEffect, useMemo } from 'react'
import { loadTeams, loadDraw, loadScores, loadPlayers, resolveNames } from '../data/loaders'
import type { Team, DrawResult, ScoresData, Standing, Match, Player } from '../types'

interface Prize {
  id: string
  icon: string
  title: string
  subtitle: string
  amount: number
  compute: (standings: Record<string, Standing[]>, playerNames: Record<string, string>, teams: Team[], scores: ScoresData) => { player: string; team: Team; stat: string } | null
}

// Winner of a knockout match, accounting for extra time and penalty shootouts.
// Full-time scores can be level when a tie is decided on penalties, so we trust
// the API's resolved `winner` field first and only fall back to the score line.
function matchWinnerId(m: Match): string | null {
  if (m.winner === 'HOME_TEAM') return m.homeTeamId
  if (m.winner === 'AWAY_TEAM') return m.awayTeamId
  if (m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore) {
    return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId
  }
  return null
}

function matchLoserId(m: Match): string | null {
  const winnerId = matchWinnerId(m)
  if (!winnerId) return null
  return winnerId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
}

// Tournament-wide goals scored/conceded per team, aggregated from every finished
// match (group stage + knockouts). Standings only carry group-stage totals, so we
// compute from matches instead. Penalty-shootout goals are excluded — football-data
// keeps those in score.penalties, not in the full-time score we read here.
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

const PRIZES: Prize[] = [
  {
    id: 'winner',
    icon: '🏆',
    title: 'Winner',
    subtitle: 'Team wins the tournament',
    amount: 100,
    compute: (_, playerNames, teams, scores) => {
      const final = scores.matches?.find(m => m.stage === 'F' && m.status === 'FINISHED')
      if (!final) return null
      const winnerId = matchWinnerId(final)
      if (!winnerId) return null
      const team = teams.find(t => t.id === winnerId)
      if (!team) return null
      return { player: playerNames[team.id] ?? '—', team, stat: 'Tournament Winner 🏆' }
    },
  },
  {
    id: 'runner-up',
    icon: '🥈',
    title: '2nd Place',
    subtitle: 'Team reaches the final',
    amount: 50,
    compute: (_, playerNames, teams, scores) => {
      const final = scores.matches?.find(m => m.stage === 'F' && m.status === 'FINISHED')
      if (!final) return null
      const loserId = matchLoserId(final)
      if (!loserId) return null
      const team = teams.find(t => t.id === loserId)
      if (!team) return null
      return { player: playerNames[team.id] ?? '—', team, stat: 'Runner-Up 🥈' }
    },
  },
  {
    id: 'most-goals',
    icon: '⚽',
    title: 'Most Goals Scored',
    subtitle: 'Highest scoring team',
    amount: 30,
    compute: (_, playerNames, teams, scores) => {
      const totals = goalTotals(scores)
      const entries = Object.entries(totals)
      if (!entries.length) return null
      const [teamId, t] = entries.reduce((a, b) => b[1].for > a[1].for ? b : a)
      if (t.for === 0) return null
      const team = teams.find(t => t.id === teamId)
      if (!team) return null
      return { player: playerNames[team.id] ?? '—', team, stat: `${t.for} goals scored` }
    },
  },
  {
    id: 'most-conceded',
    icon: '🫣',
    title: 'Most Goals Conceded',
    subtitle: 'Leakiest defence',
    amount: 20,
    compute: (_, playerNames, teams, scores) => {
      const totals = goalTotals(scores)
      const entries = Object.entries(totals)
      if (!entries.length) return null
      const [teamId, t] = entries.reduce((a, b) => b[1].against > a[1].against ? b : a)
      if (t.against === 0) return null
      const team = teams.find(t => t.id === teamId)
      if (!team) return null
      return { player: playerNames[team.id] ?? '—', team, stat: `${t.against} goals conceded` }
    },
  },
  {
    id: 'most-yellows',
    icon: '🟨',
    title: 'Most Yellow Cards',
    subtitle: 'Dirtiest team',
    amount: 20,
    compute: (_, playerNames, teams, scores) => {
      // Tournament-wide totals from match bookings (standings only cover groups)
      const entries = Object.entries(scores.cards ?? {})
      if (!entries.length) return null
      const [teamId, top] = entries.reduce((a, b) => b[1].yellow > a[1].yellow ? b : a)
      if (top.yellow === 0) return null
      const team = teams.find(t => t.id === teamId)
      if (!team) return null
      return { player: playerNames[team.id] ?? '—', team, stat: `${top.yellow} yellow cards` }
    },
  },
  {
    id: 'first-red',
    icon: '🟥',
    title: 'First Red Card',
    subtitle: 'First team to see red',
    amount: 10,
    compute: (_, playerNames, teams, scores) => {
      const red = scores.firstRedCard
      if (!red) return null
      const team = teams.find(t => t.id === red.teamId)
      if (!team) return null
      const stat = red.player
        ? `${red.player}${red.minute != null ? ` (${red.minute}')` : ''}`
        : 'First red card of the tournament'
      return { player: playerNames[team.id] ?? '—', team, stat }
    },
  },
  {
    id: 'first-eliminated',
    icon: '👋',
    title: 'First Eliminated',
    subtitle: 'First team out',
    amount: 10,
    compute: (standings, playerNames, teams) => {
      const all = Object.values(standings).flat()
      const eliminated = all.filter(s => s.eliminated)
      if (!eliminated.length) return null
      // Earliest confirmed elimination; ties broken by worst record
      const bottom = eliminated.reduce((a, b) => {
        const aAt = a.eliminatedAt ?? ''
        const bAt = b.eliminatedAt ?? ''
        if (aAt !== bAt) return aAt && (!bAt || aAt < bAt) ? a : b
        if (a.points !== b.points) return a.points < b.points ? a : b
        return a.goalDiff <= b.goalDiff ? a : b
      })
      const team = teams.find(t => t.id === bottom.teamId)
      if (!team) return null
      return { player: playerNames[team.id] ?? '—', team, stat: 'Eliminated in group stage' }
    },
  },
]

export default function PrizesPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [players, setPlayers] = useState<Player[]>([])
  const [scores, setScores] = useState<ScoresData | null>(null)
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

  if (loading) {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading prizes…</div></PageCenter>
  }

  const allStandings = scores?.standings ?? {}

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-2">Prizes</h1>
      <p className="text-white/40 text-sm mb-8">Live leaderboard — updates daily during the tournament</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRIZES.map(prize => {
          const result = prize.compute(allStandings, playerNames, teams, scores!)
          return (
            <div
              key={prize.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl">{prize.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white">{prize.title}</h3>
                  <p className="text-xs text-white/40">{prize.subtitle}</p>
                </div>
                <span className="text-sm font-bold text-yellow-400 shrink-0">€{prize.amount}</span>
              </div>

              {result ? (
                <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                  <img
                    src={result.team.flag}
                    alt={result.team.name}
                    className="w-10 h-7 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-yellow-400 truncate">{result.player}</p>
                    <p className="text-xs text-white/60 truncate">{result.team.name}</p>
                  </div>
                  <p className="text-xs text-white/40 text-right shrink-0">{result.stat}</p>
                </div>
              ) : (
                <div className="bg-white/5 rounded-xl p-3 text-white/30 text-sm text-center">
                  TBD — tournament not yet started
                </div>
              )}
            </div>
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
