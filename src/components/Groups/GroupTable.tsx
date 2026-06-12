import type { Team, Standing } from '../../types'

interface Props {
  group: string
  teams: Team[]
  playerNames: Record<string, string>
  standings: Standing[] | null
  highlight: string
}

export default function GroupTable({ group, teams, playerNames, standings, highlight }: Props) {
  const tournamentStarted = standings !== null && standings.length > 0

  const rows = teams.map(team => {
    const standing = standings?.find(s => s.teamId === team.id)
    const player = playerNames[team.id]
    const isEliminated = standing?.eliminated ?? false
    const isHighlighted = highlight && (
      player?.toLowerCase().includes(highlight.toLowerCase()) ||
      team.name.toLowerCase().includes(highlight.toLowerCase())
    )
    return { team, standing, player, isEliminated, isHighlighted }
  }).sort((a, b) => {
    if (!a.standing || !b.standing) return 0
    return b.standing.points - a.standing.points || b.standing.goalDiff - a.standing.goalDiff
  })

  const dimmed = highlight && !rows.some(r => r.isHighlighted)

  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${
      dimmed ? 'border-white/5 opacity-40' : 'border-white/10 bg-white/3'
    }`}>
      <div className="bg-gradient-to-r from-yellow-500/20 to-red-500/20 px-4 py-3 border-b border-white/10">
        <h3 className="font-bold text-yellow-400 text-sm uppercase tracking-wider">Group {group}</h3>
      </div>

      <div className="overflow-x-auto no-scrollbar">
      <table className={`w-full text-sm table-fixed ${tournamentStarted ? 'min-w-[34rem]' : ''}`}>
        <colgroup>
          <col className="w-14" />       {/* flag */}
          <col />                         {/* team name — takes remaining space */}
          <col className="w-28" />        {/* player */}
          {tournamentStarted && <>
            <col className="w-7" />
            <col className="w-7" />
            <col className="w-7" />
            <col className="w-7" />
            <col className="w-7" />
            <col className="w-7" />
            <col className="w-8" />
            <col className="w-8" />
          </>}
        </colgroup>
        <thead>
          <tr className="border-b border-white/5 text-white/30 text-xs uppercase tracking-wider">
            <th className="px-2 py-2" />
            <th className="text-left px-2 py-2">Team</th>
            <th className="text-left px-2 py-2">Player</th>
            {tournamentStarted && (
              <>
                <th className="text-center py-2">P</th>
                <th className="text-center py-2">W</th>
                <th className="text-center py-2">D</th>
                <th className="text-center py-2">L</th>
                <th className="text-center py-2">GF</th>
                <th className="text-center py-2">GA</th>
                <th className="text-center py-2">GD</th>
                <th className="text-center py-2">Pts</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, standing, player, isEliminated, isHighlighted }) => (
            <tr
              key={team.id}
              className={`border-b border-white/5 last:border-0 transition-all ${
                isHighlighted ? 'bg-yellow-400/10' : ''
              } ${isEliminated ? 'opacity-40' : ''}`}
            >
              <td className="pl-3 pr-2 py-2.5">
                <img
                  src={team.flag}
                  alt={team.name}
                  className={`w-8 h-5 min-w-8 max-w-none shrink-0 object-cover rounded transition-all ${isEliminated ? 'grayscale' : ''}`}
                />
              </td>
              <td className="px-2 py-2.5">
                <span className={`font-medium truncate block ${isEliminated ? 'text-white/40' : 'text-white'}`}>
                  {team.name}
                </span>
              </td>
              <td className="px-2 py-2.5">
                <span className={`text-xs truncate block ${isEliminated ? 'text-white/30' : 'text-white/60'}`}>
                  {player ?? '—'}
                </span>
              </td>
              {tournamentStarted && standing && (
                <>
                  <td className="text-center py-2 text-white/60">{standing.played}</td>
                  <td className="text-center py-2 text-green-400">{standing.won}</td>
                  <td className="text-center py-2 text-white/50">{standing.drawn}</td>
                  <td className="text-center py-2 text-red-400">{standing.lost}</td>
                  <td className="text-center py-2 text-white/60">{standing.goalsFor}</td>
                  <td className="text-center py-2 text-white/60">{standing.goalsAgainst}</td>
                  <td className="text-center py-2 text-white/60 text-xs">
                    {standing.goalDiff > 0 ? `+${standing.goalDiff}` : standing.goalDiff}
                  </td>
                  <td className="text-center py-2 font-bold text-white">{standing.points}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
