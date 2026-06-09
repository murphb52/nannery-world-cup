import type { Team } from '../../types'

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

interface Props {
  teams: Team[]
  /** teamId -> player name, for slots filled so far */
  assignments: Record<string, string>
  /** team currently being revealed — pulses to draw the eye */
  highlightTeamId?: string | null
}

/**
 * Compact board of all 12 groups that fills in live as the draw runs, and
 * doubles as the final results display on the completion screen.
 */
export default function GroupsBoard({ teams, assignments, highlightTeamId }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
      {GROUPS.map(group => {
        const groupTeams = teams.filter(t => t.group === group)
        return (
          <div key={group} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-3 py-1.5 bg-gradient-to-r from-yellow-500/15 to-red-500/15 border-b border-white/10">
              <span className="text-[11px] font-bold text-yellow-400 uppercase tracking-wider">Group {group}</span>
            </div>
            <div>
              {groupTeams.map((team, i) => {
                const player = assignments[team.id]
                const isHot = highlightTeamId === team.id
                return (
                  <div
                    key={team.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 ${i > 0 ? 'border-t border-white/5' : ''} transition-colors duration-300 ${
                      isHot ? 'bg-yellow-400/15' : ''
                    }`}
                  >
                    <img
                      src={team.flag}
                      alt={team.name}
                      className={`w-6 h-4 object-cover rounded shrink-0 transition-all duration-300 ${
                        player ? '' : 'grayscale opacity-40'
                      } ${isHot ? 'scale-125' : ''}`}
                    />
                    <span className={`text-xs font-medium truncate shrink-0 w-20 ${player ? 'text-white' : 'text-white/40'}`}>
                      {team.name}
                    </span>
                    <span
                      className={`text-xs truncate ml-auto text-right transition-all duration-300 ${
                        player ? (isHot ? 'text-yellow-300 font-semibold' : 'text-yellow-400/90') : 'text-white/20'
                      }`}
                    >
                      {player ?? '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
