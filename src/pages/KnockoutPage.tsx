import { useState, useEffect } from 'react'
import BracketMatch from '../components/Knockout/BracketMatch'
import { loadTeams, loadDraw, loadScores } from '../data/loaders'
import type { Team, DrawResult, Match } from '../types'

interface MatchData {
  id: string
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
  label?: string
}

interface ZoomMatch extends MatchData {
  stage: string
  date?: string
  venue?: string
}

const ROUNDS = ['R32', 'R16', 'QF', 'SF', 'F'] as const
const ROUND_LABELS: Record<string, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarter-Finals',
  SF: 'Semi-Finals',
  F: 'Final',
}

function buildPlaceholderBracket(): Record<string, MatchData[]> {
  const bracket: Record<string, MatchData[]> = {
    R32: Array.from({ length: 16 }, (_, i) => ({
      id: `R32-${i + 1}`,
      homeTeamId: null,
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
      label: `R32 Match ${i + 1}`,
    })),
    R16: Array.from({ length: 8 }, (_, i) => ({
      id: `R16-${i + 1}`,
      homeTeamId: null,
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
    })),
    QF: Array.from({ length: 4 }, (_, i) => ({
      id: `QF-${i + 1}`,
      homeTeamId: null,
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
    })),
    SF: Array.from({ length: 2 }, (_, i) => ({
      id: `SF-${i + 1}`,
      homeTeamId: null,
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
    })),
    F: [{
      id: 'F-1',
      homeTeamId: null,
      awayTeamId: null,
      homeScore: null,
      awayScore: null,
    }],
  }
  return bracket
}

function mergeScoresIntoBracket(bracket: Record<string, MatchData[]>, matches: Match[]): Record<string, MatchData[]> {
  const knockoutMatches = matches.filter(m => m.stage !== 'GROUP')
  const updated = { ...bracket }
  for (const match of knockoutMatches) {
    const stageMatches = updated[match.stage]
    if (!stageMatches) continue
    const idx = stageMatches.findIndex(m => m.id === String(match.id))
    if (idx !== -1) {
      updated[match.stage][idx] = {
        ...updated[match.stage][idx],
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      }
    }
  }
  return updated
}

export default function KnockoutPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [draw, setDraw] = useState<DrawResult>({})
  const [bracket, setBracket] = useState<Record<string, MatchData[]>>(buildPlaceholderBracket())
  const [zoom, setZoom] = useState<ZoomMatch | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadTeams(), loadDraw(), loadScores()]).then(([t, d, s]) => {
      setTeams(t)
      setDraw(d)
      if (s.matches?.length) {
        setBracket(prev => mergeScoresIntoBracket(prev, s.matches))
      }
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <PageCenter><div className="text-white/50 animate-pulse">Loading bracket…</div></PageCenter>
  }

  return (
    <div className="max-w-full px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-2">Knockout Bracket</h1>
      <p className="text-white/40 text-sm mb-8">Click any match for details</p>

      <div className="overflow-x-auto pb-6">
        <div className="flex gap-8 min-w-max items-start">
          {ROUNDS.map(round => (
            <div key={round} className="flex flex-col gap-3">
              <h3 className="text-xs uppercase tracking-wider text-white/40 text-center mb-2">
                {ROUND_LABELS[round]}
              </h3>
              <div
                className="flex flex-col gap-4 justify-around"
                style={{ minHeight: `${bracket[round].length * 72}px` }}
              >
                {bracket[round].map(match => (
                  <BracketMatch
                    key={match.id}
                    match={match}
                    teams={teams}
                    onClick={m => setZoom({ ...m, stage: round })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zoom modal */}
      {zoom && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setZoom(null)}
        >
          <div
            className="bg-gray-900 border border-white/20 rounded-2xl p-6 max-w-sm w-full"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-white">{ROUND_LABELS[zoom.stage]}</h3>
              <button onClick={() => setZoom(null)} className="text-white/40 hover:text-white text-xl">×</button>
            </div>

            {[
              { teamId: zoom.homeTeamId, score: zoom.homeScore },
              { teamId: zoom.awayTeamId, score: zoom.awayScore },
            ].map(({ teamId, score }, i) => {
              const team = teams.find(t => t.id === teamId)
              const player = teamId ? draw[teamId] : null
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl mb-2 ${i === 0 ? 'bg-white/5' : 'bg-white/5'}`}>
                  {team ? (
                    <>
                      <img src={team.flag} alt={team.name} className="w-10 h-7 object-cover rounded" />
                      <div className="flex-1">
                        <p className="font-semibold text-white">{team.name}</p>
                        {player && <p className="text-xs text-white/50">{player}</p>}
                      </div>
                      {score !== null && <span className="text-2xl font-bold text-yellow-400">{score}</span>}
                    </>
                  ) : (
                    <p className="text-white/30 text-sm">TBD</p>
                  )}
                </div>
              )
            })}
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
