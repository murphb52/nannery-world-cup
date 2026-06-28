import { useState, useEffect, useMemo } from 'react'
import { loadTeams, loadScores, resolveNames } from '../data/loaders'
import { useSweepstakes } from '../contexts/SweepstakesContext'
import { exportKnockoutPng } from '../lib/exportPng'
import type { Team, Match } from '../types'

interface MatchData {
  id: string
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
}

interface ZoomMatch extends MatchData {
  roundLabel: string
}

// Layout constants
const SLOT_H = 96    // px height per R32 slot
const MATCH_H = 80   // px height of a match card (two stacked team/player rows)
const MATCH_W = 188  // px width of a match card
const COL_GAP = 24   // px gap between columns
const BRACKET_H = 8 * SLOT_H  // 640px total
const LABEL_H = 24  // px height reserved above matches for round labels

function matchTop(roundIndex: number, matchIndex: number): number {
  const slotsPerMatch = Math.pow(2, roundIndex)
  const centerOffset = (slotsPerMatch * SLOT_H) / 2
  return matchIndex * slotsPerMatch * SLOT_H + centerOffset - MATCH_H / 2
}

function matchCenterY(roundIndex: number, matchIndex: number): number {
  return matchTop(roundIndex, matchIndex) + MATCH_H / 2
}

// Total width of one side (4 rounds) + final column in centre
const SIDE_W = 4 * MATCH_W + 3 * COL_GAP  // 680
const TOTAL_W = SIDE_W * 2 + MATCH_W + COL_GAP * 2  // full bracket width

function colX(colIndex: number): number {
  return colIndex * (MATCH_W + COL_GAP)
}

// Renders SVG connector lines for the left or right half of the bracket
function ConnectorLines({ side }: { side: 'left' | 'right' }) {
  const paths: string[] = []
  const stroke = 'rgba(255,255,255,0.2)'

  // Left side: cols 0(R32)→1(R16)→2(QF)→3(SF)→4(Final)
  // Right side (mirrored): cols 8(R32)→7(R16)→6(QF)→5(SF)→4(Final)
  // For right side we flip x around the centre of the full bracket

  const rounds = 4 // R32, R16, QF, SF — 4 columns per side

  for (let r = 0; r < rounds; r++) {
    const matchesThisRound = Math.pow(2, rounds - 1 - r) // 8,4,2,1
    const matchesNextRound = matchesThisRound / 2

    if (matchesNextRound < 1) continue // SF→Final handled separately

    for (let i = 0; i < matchesNextRound; i++) {
      const topMatchIdx = i * 2
      const botMatchIdx = i * 2 + 1
      const nextMatchIdx = i

      const topY = matchCenterY(r, topMatchIdx)
      const botY = matchCenterY(r, botMatchIdx)
      const nextY = matchCenterY(r + 1, nextMatchIdx)

      if (side === 'left') {
        const fromX = colX(r) + MATCH_W
        const toX = colX(r + 1)
        const midX = fromX + COL_GAP / 2
        // Exit lines from both matches
        paths.push(`M${fromX},${topY} H${midX}`)
        paths.push(`M${fromX},${botY} H${midX}`)
        // Vertical connector
        paths.push(`M${midX},${topY} V${botY}`)
        // Entry line to next match
        paths.push(`M${midX},${nextY} H${toX}`)
      } else {
        // Mirror: right R32 is at col 8, R16 at col 7, etc.
        const rCol = (rounds * 2) - r      // 8,7,6,5
        const nextRCol = rCol - 1           // 7,6,5,4→but SF→Final is separate
        const fromX = colX(rCol)            // left edge of right-side card
        const toX = colX(nextRCol) + MATCH_W // right edge of inner card
        const midX = toX + COL_GAP / 2
        paths.push(`M${fromX},${topY} H${midX}`)
        paths.push(`M${fromX},${botY} H${midX}`)
        paths.push(`M${midX},${topY} V${botY}`)
        paths.push(`M${midX},${nextY} H${toX}`)
      }
    }
  }

  // SF → Final connector
  const sfY = matchCenterY(3, 0)
  const finalY = matchCenterY(3, 0) // Final sits at same vertical centre
  if (side === 'left') {
    const sfRight = colX(3) + MATCH_W
    const finalLeft = colX(4)
    paths.push(`M${sfRight},${sfY} H${finalLeft}`)
  } else {
    const sfLeft = colX(5)       // right SF left edge
    const finalRight = colX(4) + MATCH_W
    paths.push(`M${sfLeft},${finalY} H${finalRight}`)
  }

  return (
    <svg
      style={{ position: 'absolute', top: LABEL_H, left: 0, width: TOTAL_W, height: BRACKET_H, pointerEvents: 'none', overflow: 'visible' }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke={stroke} strokeWidth={1.5} fill="none" />
      ))}
    </svg>
  )
}

const LEFT_ROUNDS = ['R32', 'R16', 'QF', 'SF'] as const
const RIGHT_ROUNDS = ['SF', 'QF', 'R16', 'R32'] as const
const ROUND_LABELS: Record<string, string> = {
  R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-Finals', SF: 'Semi-Finals', F: 'Final',
}

function buildPlaceholderBracket(): Record<string, MatchData[]> {
  return {
    R32: Array.from({ length: 16 }, (_, i) => ({ id: `R32-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    R16: Array.from({ length: 8 }, (_, i) => ({ id: `R16-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    QF: Array.from({ length: 4 }, (_, i) => ({ id: `QF-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    SF: Array.from({ length: 2 }, (_, i) => ({ id: `SF-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    F: [{ id: 'F-1', homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null }],
  }
}

function MatchCard({ match, teams, playerNames, flipped = false, onClick }: {
  match: MatchData; teams: Team[]; playerNames: Record<string, string>; flipped?: boolean; onClick: () => void
}) {
  const home = teams.find(t => t.id === match.homeTeamId) ?? null
  const away = teams.find(t => t.id === match.awayTeamId) ?? null
  const finished = match.homeScore !== null && match.awayScore !== null
  const homeWon = finished && match.homeScore! > match.awayScore!
  const awayWon = finished && match.awayScore! > match.homeScore!

  function Row({ team, score, won, lost }: { team: Team | null; score: number | null; won: boolean; lost: boolean }) {
    const player = team ? playerNames[team.id] : null
    return (
      <div className={`flex items-center gap-1.5 px-2 h-1/2 ${lost ? 'opacity-40' : ''}`}>
        {team
          ? <>
              <img src={team.flag} alt={team.name} className={`w-6 h-4 object-cover rounded shrink-0 ${lost ? 'grayscale' : ''}`} />
              <div className="flex-1 min-w-0 leading-tight">
                <div className={`text-xs truncate ${won ? 'text-yellow-400 font-semibold' : 'text-white/80'}`}>{team.name}</div>
                {player && <div className="text-[10px] text-white/45 truncate">{player}</div>}
              </div>
              {score !== null && <span className={`text-sm font-bold shrink-0 ${won ? 'text-yellow-400' : 'text-white/40'}`}>{score}</span>}
            </>
          : <>
              <div className="w-6 h-4 bg-white/10 rounded shrink-0" />
              <span className="text-xs text-white/25 flex-1">TBD</span>
            </>
        }
      </div>
    )
  }

  const rows = flipped
    ? [{ team: away, score: match.awayScore, won: awayWon, lost: homeWon }, { team: home, score: match.homeScore, won: homeWon, lost: awayWon }]
    : [{ team: home, score: match.homeScore, won: homeWon, lost: awayWon }, { team: away, score: match.awayScore, won: awayWon, lost: homeWon }]

  return (
    <button
      onClick={onClick}
      style={{ width: MATCH_W, height: MATCH_H }}
      className="rounded-lg border border-white/15 bg-white/5 hover:border-yellow-400/40 hover:bg-white/10 transition-all text-left flex flex-col justify-center overflow-hidden"
    >
      <Row {...rows[0]} />
      <div className="h-px bg-white/10 mx-2" />
      <Row {...rows[1]} />
    </button>
  )
}

function BracketColumn({ rounds, bracket, teams, playerNames, leftSide, onMatchClick }: {
  rounds: readonly string[]
  bracket: Record<string, MatchData[]>
  teams: Team[]
  playerNames: Record<string, string>
  leftSide: boolean
  onMatchClick: (m: MatchData, round: string) => void
}) {
  return (
    <div className="flex gap-0" style={{ flexDirection: 'row' }}>
      {rounds.map((round, colIdx) => {
        const allMatches = bracket[round] ?? []
        // Left side uses first half, right side uses second half
        const matches = leftSide
          ? allMatches.slice(0, allMatches.length / 2)
          : allMatches.slice(allMatches.length / 2)
        // For right side, round index increases going inward (toward center)
        const roundIdx = leftSide ? colIdx : rounds.length - 1 - colIdx

        return (
          <div key={round} style={{ position: 'relative', width: MATCH_W, height: BRACKET_H, marginLeft: colIdx > 0 ? COL_GAP : 0 }}>
            {/* Round label at top */}
            <div
              className="absolute top-0 w-full text-center text-xs uppercase tracking-wider text-white/30 pb-2"
              style={{ top: -24 }}
            >
              {ROUND_LABELS[round]}
            </div>
            {matches.map((match, i) => (
              <div key={match.id} style={{ position: 'absolute', top: matchTop(roundIdx, i), left: 0 }}>
                <MatchCard
                  match={match}
                  teams={teams}
                  playerNames={playerNames}
                  flipped={!leftSide}
                  onClick={() => onMatchClick(match, round)}
                />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

export default function KnockoutPage() {
  const { config, players, draw } = useSweepstakes()
  const [teams, setTeams] = useState<Team[]>([])
  const [bracket, setBracket] = useState<Record<string, MatchData[]>>(buildPlaceholderBracket())
  const [zoom, setZoom] = useState<ZoomMatch | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([loadTeams(), loadScores()]).then(([t, s]) => {
      setTeams(t)
      setLastUpdated(s.lastUpdated ?? null)
      if (s.matches?.length) {
        const updated = { ...buildPlaceholderBracket() }
        // Group knockout matches by stage. The API match `id` is not the
        // placeholder slot id (`R32-1`…), but ids run sequentially within a
        // stage in bracket order, so sort by id and fill slots positionally.
        const byStage: Record<string, Match[]> = {}
        for (const m of s.matches.filter((m: Match) => m.stage !== 'GROUP')) {
          if (!updated[m.stage]) continue // skip stages not in the bracket (e.g. THIRD_PLACE)
          ;(byStage[m.stage] ??= []).push(m)
        }
        for (const [stage, matches] of Object.entries(byStage)) {
          matches.sort((a, b) => a.id - b.id)
          matches.forEach((m, idx) => {
            const slot = updated[stage][idx]
            if (!slot) return
            updated[stage][idx] = { ...slot, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore }
          })
        }
        setBracket(updated)
      }
      setLoading(false)
    })
  }, [])

  const playerNames = useMemo(() => resolveNames(draw, players), [draw, players])

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportKnockoutPng(teams, bracket, playerNames, `${config.name} ${config.year}`, lastUpdated)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[80vh] text-white/50 animate-pulse">Loading bracket…</div>
  }

  const final = bracket.F?.[0] ?? null

  return (
    <div className="px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold text-white">Knockout Bracket</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/10 disabled:opacity-40 transition-all shrink-0"
        >
          {exporting ? 'Generating…' : '📸 Share as image'}
        </button>
      </div>
      <p className="text-white/40 text-sm mb-10">Click any match for details</p>
      {exportError && (
        <div className="mb-6 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-red-400 text-sm">
          ⚠ {exportError}
        </div>
      )}

      <div className="overflow-x-auto pb-6">
        <div style={{ position: 'relative', paddingTop: 24, minWidth: 'max-content', width: TOTAL_W }}>

          {/* Connector lines — rendered behind everything */}
          <ConnectorLines side="left" />
          <ConnectorLines side="right" />

          {/* Match columns — laid out absolutely so connectors can span the full width */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: COL_GAP }}>

            {/* Left side: R32 → SF */}
            <BracketColumn
              rounds={LEFT_ROUNDS}
              bracket={bracket}
              teams={teams}
              playerNames={playerNames}
              leftSide={true}
              onMatchClick={(m, r) => setZoom({ ...m, roundLabel: ROUND_LABELS[r] })}
            />

            {/* Final in centre */}
            <div style={{ position: 'relative', width: MATCH_W, height: BRACKET_H }}>
              <div className="absolute w-full text-center text-xs uppercase tracking-wider text-yellow-400/60" style={{ top: -24 }}>
                Final
              </div>
              {final && (
                <div style={{ position: 'absolute', top: matchTop(3, 0), left: 0 }}>
                  <MatchCard
                    match={final}
                    teams={teams}
                    playerNames={playerNames}
                    onClick={() => setZoom({ ...final, roundLabel: 'Final' })}
                  />
                </div>
              )}
            </div>

            {/* Right side: SF → R32 */}
            <BracketColumn
              rounds={RIGHT_ROUNDS}
              bracket={bracket}
              teams={teams}
              playerNames={playerNames}
              leftSide={false}
              onMatchClick={(m, r) => setZoom({ ...m, roundLabel: ROUND_LABELS[r] })}
            />
          </div>
        </div>
      </div>

      {/* Zoom modal */}
      {zoom && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <div className="bg-gray-900 border border-white/20 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-white">{zoom.roundLabel}</h3>
              <button onClick={() => setZoom(null)} className="text-white/40 hover:text-white text-xl leading-none">×</button>
            </div>
            {[{ teamId: zoom.homeTeamId, score: zoom.homeScore }, { teamId: zoom.awayTeamId, score: zoom.awayScore }].map(({ teamId, score }, i) => {
              const team = teams.find(t => t.id === teamId)
              const player = teamId ? playerNames[teamId] : null
              return (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 mb-2">
                  {team ? <>
                    <img src={team.flag} alt={team.name} className="w-10 h-7 object-cover rounded" />
                    <div className="flex-1">
                      <p className="font-semibold text-white">{team.name}</p>
                      {player && <p className="text-xs text-white/50">{player}</p>}
                    </div>
                    {score !== null && <span className="text-2xl font-bold text-yellow-400">{score}</span>}
                  </> : <p className="text-white/30 text-sm">TBD</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
