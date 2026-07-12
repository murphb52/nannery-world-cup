import type { Match } from '../types'

export interface BracketSlot {
  id: string
  homeTeamId: string | null
  awayTeamId: string | null
  homeScore: number | null
  awayScore: number | null
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
  penalties?: { home: number; away: number } | null
  date?: string | null
}

function buildPlaceholderBracket(): Record<string, BracketSlot[]> {
  return {
    R32: Array.from({ length: 16 }, (_, i) => ({ id: `R32-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    R16: Array.from({ length: 8 }, (_, i) => ({ id: `R16-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    QF: Array.from({ length: 4 }, (_, i) => ({ id: `QF-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    SF: Array.from({ length: 2 }, (_, i) => ({ id: `SF-${i + 1}`, homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null })),
    F: [{ id: 'F-1', homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null }],
  }
}

/** Returns the winning team id of a finished match, or null if undecided. */
function matchWinner(m: BracketSlot): string | null {
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
function overlayApiResult(slot: BracketSlot, m: Match) {
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

// Bracket stages in progression order. Slot `i` of one stage feeds slot
// `floor(i/2)` of the next — home if `i` is even, away if odd — matching the
// positional fill used when loading matches and the SVG connector layout.
const STAGE_ORDER = ['R32', 'R16', 'QF', 'SF', 'F'] as const

// Advance the winner of each finished match into the next round so a team that
// has won is shown in the following stage even before the upstream data source
// populates that fixture. Only fills empty slots, so real API team assignments
// always take precedence.
function propagateWinners(bracket: Record<string, BracketSlot[]>): Record<string, BracketSlot[]> {
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

export interface KnockoutResolution {
  bracket: Record<string, BracketSlot[]>
  /** Team ids resolved for a knockout fixture by its real API match id, even
   *  when the API record itself hasn't been assigned team ids yet (e.g. the
   *  upstream data source lags behind a just-finished previous round). */
  resolvedTeamsByMatchId: Map<number, { homeTeamId: string | null; awayTeamId: string | null }>
}

export function resolveKnockout(matches: Match[]): KnockoutResolution {
  const bracket = buildPlaceholderBracket()
  const resolvedTeamsByMatchId = new Map<number, { homeTeamId: string | null; awayTeamId: string | null }>()
  const knockout = matches.filter(m => m.stage !== 'GROUP' && bracket[m.stage])

  // R32 is the only knockout round whose API match order matches the
  // bracket-slot order, so fill it positionally — ids run sequentially in
  // bracket order within the round.
  knockout
    .filter(m => m.stage === 'R32')
    .sort((a, b) => a.id - b.id)
    .forEach((m, idx) => {
      const slot = bracket.R32[idx]
      if (!slot) return
      bracket.R32[idx] = { ...slot, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, winner: m.winner ?? null, penalties: m.penalties ?? null, date: m.date }
      resolvedTeamsByMatchId.set(m.id, { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId })
    })

  // Process each later round in bracket order. A round's slots only get
  // their team ids once the previous round's winners are propagated in,
  // so propagation must happen before that round's API results are
  // matched by team id — otherwise a fixture whose teams are already
  // decided (e.g. a semi-final the API has pre-assigned) has nothing to
  // match against yet and silently fails to attach to its slot.
  for (const stage of ['R16', 'QF', 'SF', 'F'] as const) {
    propagateWinners(bracket)

    // Overlay API data onto the slot whose teams match. The API numbers
    // these fixtures in an order that does not follow the bracket
    // layout, so filling them positionally would place a team in the
    // wrong slot and duplicate it against the propagated one. Records
    // with no team ids of their own can't be matched this way — collect
    // them as leftovers instead.
    const leftover: Match[] = []
    for (const m of knockout) {
      if (m.stage !== stage) continue
      const apiTeams = [m.homeTeamId, m.awayTeamId].filter(Boolean)
      if (!apiTeams.length) { leftover.push(m); continue }
      const slot = bracket[stage].find(sl =>
        (sl.homeTeamId != null && apiTeams.includes(sl.homeTeamId)) ||
        (sl.awayTeamId != null && apiTeams.includes(sl.awayTeamId)))
      if (slot) {
        overlayApiResult(slot, m)
        resolvedTeamsByMatchId.set(m.id, { homeTeamId: slot.homeTeamId, awayTeamId: slot.awayTeamId })
      } else {
        leftover.push(m)
      }
    }

    // Leftover fixtures are the ones the API hasn't assigned team ids to yet
    // — kickoff times for later rounds are fixed on the calendar before the
    // bracket path is known, so the record itself may still be blank even
    // after this app has already worked out the teams via propagation above
    // (e.g. a semi-final right after its quarter-finals finish). Attach each
    // leftover's date to whichever slot in this stage is still missing one,
    // in id order — this covers both genuinely-undecided slots and ones
    // already resolved by propagation ahead of the upstream data source.
    const dateless = bracket[stage].filter(sl => !sl.date)
    leftover
      .sort((a, b) => a.id - b.id)
      .forEach((m, idx) => {
        const slot = dateless[idx]
        if (!slot) return
        slot.date = m.date
        resolvedTeamsByMatchId.set(m.id, { homeTeamId: slot.homeTeamId, awayTeamId: slot.awayTeamId })
      })
  }

  return { bracket, resolvedTeamsByMatchId }
}
