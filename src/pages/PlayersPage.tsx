import { useState, useEffect, useMemo } from 'react'
import { loadPlayers, loadTeams, loadDraw } from '../data/loaders'
import type { Team, DrawResult, Player } from '../types'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadPlayers(), loadTeams(), loadDraw()]).then(([p, t, d]) => {
      setPlayers(p)
      setTeams(t)
      setDraw(d)
      setLoading(false)
    })
  }, [])

  // Invert the draw (teamId -> playerId) into playerId -> team
  const teamByPlayerId = useMemo(() => {
    const map = new Map<string, Team>()
    for (const [teamId, playerId] of Object.entries(draw)) {
      const team = teams.find(t => t.id === teamId)
      if (team) map.set(playerId, team)
    }
    return map
  }, [draw, teams])

  if (loading) {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading players…</div></PageCenter>
  }

  const drawDone = teamByPlayerId.size > 0

  const filtered = players
    .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Players</h1>
        <p className="text-white/40 text-sm">{players.length} players in the draw</p>
      </div>

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

      {filtered.length === 0 ? (
        <div className="text-white/30 text-sm">No players match "{search}".</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(player => {
            const team = teamByPlayerId.get(player.id)
            return (
              <div
                key={player.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
              >
                {team ? (
                  <img
                    src={team.flag}
                    alt={team.name}
                    className="w-10 h-7 object-cover rounded shrink-0"
                  />
                ) : (
                  <div className="w-10 h-7 rounded bg-white/5 border border-white/10 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{player.name}</p>
                  {team ? (
                    <p className="text-xs text-white/50 truncate">
                      {team.name} · Group {team.group}
                    </p>
                  ) : (
                    <p className="text-xs text-white/30">
                      {drawDone ? 'No team assigned' : 'Awaiting the draw'}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
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
