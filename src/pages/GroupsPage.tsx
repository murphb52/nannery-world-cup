import { useState, useEffect } from 'react'
import GroupTable from '../components/Groups/GroupTable'
import { loadTeams, loadDraw, loadScores } from '../data/loaders'
import type { Team, DrawResult, ScoresData } from '../types'

export default function GroupsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadTeams(), loadDraw(), loadScores()]).then(([t, d, s]) => {
      setTeams(t)
      setDraw(d)
      setScores(s)
      setLoading(false)
    })
  }, [])

  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  const drawEmpty = Object.keys(draw).length === 0

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
          const standings = scores?.standings?.[group] ?? null
          return (
            <GroupTable
              key={group}
              group={group}
              teams={groupTeams}
              draw={draw}
              standings={standings}
              highlight={search}
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
