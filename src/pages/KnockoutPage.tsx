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
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  penalties?: { home: number; away: number } | null
  date?: string | null
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

interface ZoomMatch extends MatchData {
  roundLabel: string
}

// Layout constants
const SLOT_H = 96    // px height per R32 slot
const MATCH_H = 80   // px height of a match card (two stacked team/player rows)
const MID_H = 16     // px height of the kickoff-time band between the two rows
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

// Bracket stages in progression order. Slot `i` of one stage feeds slot
// `floor(i/2)` of the next — home if `i` is even, away if odd — matching the
// positional fill used when loading matches and the SVG connector layout.
const STAGE_ORDER = ['R32', 'R16', 'QF', 'SF', 'F'] as const

/** Returns the winning team id of a finished match, or null if undecided. */
function matchWinner(m: MatchData): string | null {
  if (m.winner === 'HOME_TEAM') return m.homeTeamId
  if (m.winner === 'AWAY_TEAM') return m.awayTeamId
  if (m.homeScore === null || m.awayScore === null) return null
  if (m.homeScore > m.awayScore) return m.homeTeamId
  if (m.awayScore > m.homeScore) return m.awayTeamId
  return null // draw with no decided winner (e.g. pending penalties)
}

// Overlay an API result onto the bracket slot that holds the same fixture,
// aligning home/away to the slot's existing orientation by team id (the API may
// list the teams in the opposite order to how propagation placed them). Any team
// the propagation could not yet determine is filled in from the API match.
function overlayApiResult(slot: MatchData, m: Match) {
  const flipped = slot.homeTeamId != null && slot.homeTeamId === m.awayTeamId
  slot.homeScore = flipped ? m.awayScore : m.homeScore
  slot.awayScore = flipped ? m.homeScore : m.awayScore
  slot.winner = flipped
    ? (m.winner === 'HOME_TEAM' ? 'AWAY_TEAM' : m.winner === 'AWAY_TEAM' ? 'HOME_TEAM' : m.winner ?? null)
    : (m.winner ?? null)
  slot.penalties = m.penalties
    ? (flipped ? { home: m.penalties.away, away: m.penalties.home } : m.penalties)
    : null
  slot.date = m.date
  if (slot.homeTeamId == null) slot.homeTeamId = flipped ? m.awayTeamId : m.homeTeamId
  if (slot.awayTeamId == null) slot.awayTeamId = flipped ? m.homeTeamId : m.awayTeamId
}

// Advance the winner of each finished match into the next round so a team that
// has won is shown in the following stage even before the upstream data source
// populates that fixture. Only fills empty slots, so real API team assignments
// always take precedence.
function propagateWinners(bracket: Record<string, MatchData[]>): Record<string, MatchData[]> {
  for (let r = 0; r < STAGE_ORDER.length - 1; r++) {
    const cur = bracket[STAGE_ORDER[r]] ?? []
    const next = bracket[STAGE_ORDER[r + 1]] ?? []
    cur.forEach((match, idx) => {
      const winner = matchWinner(match)
      if (!winner) return
      const nextSlot = next[Math.floor(idx / 2)]
      if (!nextSlot) return
      if (idx % 2 === 0) {
        if (nextSlot.homeTeamId === null) nextSlot.homeTeamId = winner
      } else {
        if (nextSlot.awayTeamId === null) nextSlot.awayTeamId = winner
      }
    })
  }
  return bracket
}

function MatchCard({ match, teams, playerNames, flipped = false, onClick }: {
  match: MatchData; teams: Team[]; playerNames: Record<string, string>; flipped?: boolean; onClick: () => void
}) {
  const home = teams.find(t => t.id === match.homeTeamId) ?? null
  const away = teams.find(t => t.id === match.awayTeamId) ?? null
  const finished = match.homeScore !== null && match.awayScore !== null
  // Prefer the explicit winner (set for penalty shootouts, where the on-pitch
  // score is level), falling back to the run-of-play score.
  const homeWon = match.winner === 'HOME_TEAM' || (finished && match.winner == null && match.homeScore! > match.awayScore!)
  const awayWon = match.winner === 'AWAY_TEAM' || (finished && match.winner == null && match.awayScore! > match.homeScore!)

  function Row({ team, score, pen, won, lost }: { team: Team | null; score: number | null; pen: number | null; won: boolean; lost: boolean }) {
    const player = team ? playerNames[team.id] : null
    return (
      <div className={`flex items-center gap-1.5 px-2 h-full ${lost ? 'opacity-40' : ''}`}>
        {team
          ? <>
              <img src={team.flag} alt={team.name} className={`w-6 h-4 object-cover rounded shrink-0 ${lost ? 'grayscale' : ''}`} />
              <div className="flex-1 min-w-0 leading-tight">
                <div className={`text-xs truncate ${won ? 'text-yellow-400 font-semibold' : 'text-white/80'}`}>{team.name}</div>
                {player && <div className="text-[10px] text-white/45 truncate">{player}</div>}
              </div>
              {score !== null && (
                <span className={`text-sm font-bold shrink-0 ${won ? 'text-yellow-400' : 'text-white/40'}`}>
                  {score}{pen !== null && <span className="text-[10px] font-semibold align-top ml-0.5">({pen})</span>}
                </span>
              )}
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
    ? [{ team: away, score: match.awayScore, pen: match.penalties?.away ?? null, won: awayWon, lost: homeWon }, { team: home, score: match.homeScore, pen: match.penalties?.home ?? null, won: homeWon, lost: awayWon }]
    : [{ team: home, score: match.homeScore, pen: match.penalties?.home ?? null, won: homeWon, lost: awayWon }, { team: away, score: match.awayScore, pen: match.penalties?.away ?? null, won: awayWon, lost: homeWon }]

  // Rows split the card height evenly, leaving a fixed middle band for the
  // kickoff time so it reads as part of this card, not a neighbor's.
  const rowH = (MATCH_H - MID_H) / 2

  return (
    <button
      onClick={onClick}
      style={{ width: MATCH_W, height: MATCH_H }}
      className="rounded-lg border border-white/15 bg-white/5 hover:border-yellow-400/40 hover:bg-white/10 transition-all text-left flex flex-col overflow-hidden"
    >
      <div style={{ height: rowH }}><Row {...rows[0]} /></div>
      <div style={{ height: MID_H }} className="flex items-center justify-center border-t border-b border-white/10 px-2">
        {match.date && (
          <span className="text-[9px] leading-none text-white/35 truncate">{formatKickoff(match.date)}</span>
        )}
      </div>
      <div style={{ height: rowH }}><Row {...rows[1]} /></div>
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
              <div key={match.id} style={{ position: 'absolute', top: matchTop(roundIdx, i), left: 0, width: MATCH_W }}>
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
        const updated = buildPlaceholderBracket()
        // Knockout matches in the bracket (skip stages not shown, e.g. THIRD_PLACE).
        const knockout = s.matches.filter((m: Match) => m.stage !== 'GROUP' && updated[m.stage])

        // R32 is the only knockout round whose API match order matches the
        // bracket-slot order, so fill it positionally — ids run sequentially in
        // bracket order within the round.
        knockout
          .filter((m: Match) => m.stage === 'R32')
          .sort((a, b) => a.id - b.id)
          .forEach((m, idx) => {
            const slot = updated.R32[idx]
            if (!slot) return
            updated.R32[idx] = { ...slot, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, winner: m.winner ?? null, penalties: m.penalties ?? null, date: m.date }
          })

        // Establish team positions for every later round from the R32 results.
        propagateWinners(updated)

        // Overlay API data for later rounds onto the slot whose teams match. The
        // API numbers these fixtures in an order that does not follow the bracket
        // layout, so filling them positionally would place a team in the wrong
        // slot and duplicate it against the propagated one.
        for (const m of knockout) {
          if (m.stage === 'R32') continue
          const apiTeams = [m.homeTeamId, m.awayTeamId].filter(Boolean)
          if (!apiTeams.length) continue
          const slot = updated[m.stage].find(sl =>
            (sl.homeTeamId != null && apiTeams.includes(sl.homeTeamId)) ||
            (sl.awayTeamId != null && apiTeams.includes(sl.awayTeamId)))
          if (slot) overlayApiResult(slot, m)
        }

        // QF/SF/F kickoff times are fixed on the tournament calendar before the
        // teams are known, so the API sends these fixtures with null team ids —
        // the match-by-team overlay above can't place them. Fill them
        // positionally instead, same assumption as R32. Once the teams are
        // decided the API match gains real team ids and gets overlaid properly
        // above, correcting any slot this guessed wrong.
        for (const stage of ['QF', 'SF', 'F'] as const) {
          knockout
            .filter((m: Match) => m.stage === stage && m.homeTeamId == null && m.awayTeamId == null)
            .sort((a, b) => a.id - b.id)
            .forEach((m, idx) => {
              const slot = updated[stage][idx]
              if (slot) slot.date = m.date
            })
        }

        // Re-propagate now that later-round results are overlaid, so a
        // decided R16/QF/SF match advances its winner into the next slot
        // even when the API hasn't populated that fixture yet.
        propagateWinners(updated)

        setBracket({ ...updated })
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
                <div style={{ position: 'absolute', top: matchTop(3, 0), left: 0, width: MATCH_W }}>
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
            {[{ teamId: zoom.homeTeamId, score: zoom.homeScore, pen: zoom.penalties?.home ?? null }, { teamId: zoom.awayTeamId, score: zoom.awayScore, pen: zoom.penalties?.away ?? null }].map(({ teamId, score, pen }, i) => {
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
                    {score !== null && (
                      <span className="text-2xl font-bold text-yellow-400">
                        {score}{pen !== null && <span className="text-sm font-semibold align-top ml-1">({pen})</span>}
                      </span>
                    )}
                  </> : <p className="text-white/30 text-sm">TBD</p>}
                </div>
              )
            })}
            {zoom.penalties && (
              <p className="text-center text-xs text-white/40 mt-1">Decided on penalties ({zoom.penalties.home}–{zoom.penalties.away})</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
