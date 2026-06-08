import type { Team } from '../../types'

interface MatchData {
  id: string
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
  label?: string
}

interface Props {
  match: MatchData
  teams: Team[]
  onClick: (match: MatchData) => void
}

export default function BracketMatch({ match, teams, onClick }: Props) {
  const home = teams.find(t => t.id === match.homeTeamId)
  const away = teams.find(t => t.id === match.awayTeamId)
  const finished = match.homeScore !== null && match.awayScore !== null

  const homeWon = finished && match.homeScore! > match.awayScore!
  const awayWon = finished && match.awayScore! > match.homeScore!

  function TeamRow({ team, score, won, lost }: { team: Team | null; score: number | null; won: boolean; lost: boolean }) {
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 ${lost ? 'opacity-40' : ''}`}>
        {team ? (
          <>
            <img src={team.flag} alt={team.name} className={`w-7 h-4 object-cover rounded ${lost ? 'grayscale' : ''}`} />
            <span className={`text-xs flex-1 truncate ${won ? 'text-yellow-400 font-semibold' : 'text-white/80'}`}>
              {team.name}
            </span>
            {score !== null && (
              <span className={`text-xs font-bold ml-1 ${won ? 'text-yellow-400' : 'text-white/50'}`}>{score}</span>
            )}
          </>
        ) : (
          <>
            <div className="w-7 h-4 bg-white/10 rounded" />
            <span className="text-xs text-white/30 flex-1">{match.label ?? 'TBD'}</span>
          </>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => onClick(match)}
      className="w-36 rounded-lg border border-white/15 bg-white/5 overflow-hidden hover:border-yellow-400/30 hover:bg-white/10 transition-all text-left"
    >
      <TeamRow team={home ?? null} score={match.homeScore} won={homeWon} lost={awayWon} />
      <div className="h-px bg-white/10" />
      <TeamRow team={away ?? null} score={match.awayScore} won={awayWon} lost={homeWon} />
    </button>
  )
}
