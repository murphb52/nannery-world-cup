import { useState, useEffect } from 'react'
import { loadTeams, loadDraw, loadScores } from '../data/loaders'
import type { Team, DrawResult, ScoresData, Standing } from '../types'

interface Prize {
  id: string
  icon: string
  title: string
  subtitle: string
  compute: (standings: Standing[], draw: DrawResult, teams: Team[], scores: ScoresData) => { player: string; team: Team; stat: string } | null
}

const PRIZES: Prize[] = [
  {
    id: 'winner',
    icon: '🏆',
    title: 'Winner',
    subtitle: 'Team wins the tournament',
    compute: (_, draw, teams, scores) => {
      const final = scores.matches?.find(m => m.stage === 'F' && m.status === 'FINISHED')
      if (!final) return null
      const winnerId = final.homeScore! > final.awayScore! ? final.homeTeamId : final.awayTeamId
      const team = teams.find(t => t.id === winnerId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: 'Tournament Winner 🏆' }
    },
  },
  {
    id: 'runner-up',
    icon: '🥈',
    title: '2nd Place',
    subtitle: 'Team reaches the final',
    compute: (_, draw, teams, scores) => {
      const final = scores.matches?.find(m => m.stage === 'F' && m.status === 'FINISHED')
      if (!final) return null
      const loserId = final.homeScore! < final.awayScore! ? final.homeTeamId : final.awayTeamId
      const team = teams.find(t => t.id === loserId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: 'Runner-Up 🥈' }
    },
  },
  {
    id: 'most-goals',
    icon: '⚽',
    title: 'Most Goals Scored',
    subtitle: 'Highest scoring team',
    compute: (standings, draw, teams) => {
      const all = Object.values(standings).flat() as Standing[]
      if (!all.length) return null
      const top = all.reduce((a, b) => a.goalsFor > b.goalsFor ? a : b)
      if (top.goalsFor === 0) return null
      const team = teams.find(t => t.id === top.teamId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: `${top.goalsFor} goals scored` }
    },
  },
  {
    id: 'most-conceded',
    icon: '🫣',
    title: 'Most Goals Conceded',
    subtitle: 'Leakiest defence',
    compute: (standings, draw, teams) => {
      const all = Object.values(standings).flat() as Standing[]
      if (!all.length) return null
      const top = all.reduce((a, b) => a.goalsAgainst > b.goalsAgainst ? a : b)
      if (top.goalsAgainst === 0) return null
      const team = teams.find(t => t.id === top.teamId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: `${top.goalsAgainst} goals conceded` }
    },
  },
  {
    id: 'most-yellows',
    icon: '🟨',
    title: 'Most Yellow Cards',
    subtitle: 'Dirtiest team',
    compute: (standings, draw, teams) => {
      const all = Object.values(standings).flat() as Standing[]
      if (!all.length) return null
      const top = all.reduce((a, b) => a.yellowCards > b.yellowCards ? a : b)
      if (top.yellowCards === 0) return null
      const team = teams.find(t => t.id === top.teamId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: `${top.yellowCards} yellow cards` }
    },
  },
  {
    id: 'first-red',
    icon: '🟥',
    title: 'First Red Card',
    subtitle: 'First team to see red',
    compute: (standings, draw, teams) => {
      const all = Object.values(standings).flat() as Standing[]
      const withRed = all.filter(s => s.redCards > 0)
      if (!withRed.length) return null
      const top = withRed[0]
      const team = teams.find(t => t.id === top.teamId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: 'First red card of the tournament' }
    },
  },
  {
    id: 'first-eliminated',
    icon: '👋',
    title: 'First Eliminated',
    subtitle: 'First team out',
    compute: (standings, draw, teams) => {
      const all = Object.values(standings).flat() as Standing[]
      const eliminated = all.filter(s => s.eliminated)
      if (!eliminated.length) return null
      const bottom = eliminated.reduce((a, b) => a.points < b.points ? a : b)
      const team = teams.find(t => t.id === bottom.teamId)
      if (!team) return null
      return { player: draw[team.id] ?? '—', team, stat: 'Eliminated in group stage' }
    },
  },
]

export default function PrizesPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadTeams(), loadDraw(), loadScores()]).then(([t, d, s]) => {
      setTeams(t)
      setDraw(d)
      setScores(s)
      setLoading(false)
    })
  }, [])

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
          const result = prize.compute(allStandings as any, draw, teams, scores!)
          return (
            <div
              key={prize.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl">{prize.icon}</span>
                <div>
                  <h3 className="font-bold text-white">{prize.title}</h3>
                  <p className="text-xs text-white/40">{prize.subtitle}</p>
                </div>
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
