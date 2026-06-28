import { useState, useEffect, useMemo } from 'react'
import { loadTeams, loadScores, resolveNames } from '../data/loaders'
import { useSweepstakes } from '../contexts/SweepstakesContext'
import type { Team, DrawResult, ScoresData, Standing, Match, Player } from '../types'
import type { PrizeDefinition } from '../config/sweepstakes'

interface PrizeResult {
  player: string
  team?: Team
  teams?: Team[]
  stat: string
  /** Per-team badge (e.g. each team's own-goal tally), keyed by teamId. */
  teamNotes?: Record<string, string>
  /** Second-placed team(s) — shown so players can see if they're close. */
  runnersUp?: { teams: Team[]; stat: string }
}

type PrizeComputer = (
  scores: ScoresData,
  draw: DrawResult,
  players: Player[],
  teams: Team[]
) => PrizeResult | null

// --- Shared helpers ---

function matchWinnerId(m: Match): string | null {
  if (m.winner === 'HOME_TEAM') return m.homeTeamId
  if (m.winner === 'AWAY_TEAM') return m.awayTeamId
  if (m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore) {
    return m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId
  }
  return null
}

function matchLoserId(m: Match): string | null {
  const winnerId = matchWinnerId(m)
  if (!winnerId) return null
  return winnerId === m.homeTeamId ? m.awayTeamId : m.homeTeamId
}

// Teams that can no longer win anything: group-stage eliminated, or losers of
// a finished knockout match. Used to fade their flags on the prizes page.
function eliminatedTeamIds(scores: ScoresData): Set<string> {
  const out = new Set<string>()
  for (const group of Object.values(scores.standings ?? {})) {
    for (const s of group) {
      if (s.eliminated) out.add(s.teamId)
    }
  }
  for (const m of scores.matches ?? []) {
    if (m.stage === 'GROUP' || m.status !== 'FINISHED') continue
    const loser = matchLoserId(m)
    if (loser) out.add(loser)
  }
  return out
}

function goalTotals(scores: ScoresData): Record<string, { for: number; against: number }> {
  const totals: Record<string, { for: number; against: number }> = {}
  for (const m of scores.matches ?? []) {
    if (m.status !== 'FINISHED' || m.homeScore == null || m.awayScore == null) continue
    const home = (totals[m.homeTeamId] ??= { for: 0, against: 0 })
    const away = (totals[m.awayTeamId] ??= { for: 0, against: 0 })
    home.for += m.homeScore
    home.against += m.awayScore
    away.for += m.awayScore
    away.against += m.homeScore
  }
  return totals
}

// Group draw by player → [teamId, ...]
function playerTeamMap(draw: DrawResult): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const [teamId, playerId] of Object.entries(draw)) {
    const existing = map.get(playerId) ?? []
    map.set(playerId, [...existing, teamId])
  }
  return map
}

function playerName(playerId: string, players: Player[]): string {
  return players.find(p => p.id === playerId)?.name ?? playerId
}

// Group teams into descending value tiers (ignoring zero/negative values), so
// tier[0] is the leader(s) and tier[1] is the next-closest team(s).
function valueTiers(valueByTeam: [string, number][], teams: Team[]): { value: number; teams: Team[] }[] {
  const byValue = new Map<number, Team[]>()
  for (const [id, val] of valueByTeam) {
    if (val <= 0) continue
    const team = teams.find(t => t.id === id)
    if (!team) continue
    const arr = byValue.get(val) ?? []
    arr.push(team)
    byValue.set(val, arr)
  }
  return [...byValue.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([value, tierTeams]) => ({ value, teams: tierTeams }))
}

// Build a leaderboard-style result: the top tier as the winner(s), plus the
// second tier as runners-up so players can gauge how close they are.
function leaderboardResult(
  tiers: { value: number; teams: Team[] }[],
  names: Record<string, string>,
  statFor: (value: number) => string
): PrizeResult | null {
  const lead = tiers[0]
  if (!lead) return null
  const uniquePlayers = [...new Set(lead.teams.map(t => names[t.id] ?? '—'))]
  const result: PrizeResult = {
    player: uniquePlayers.join(' & '),
    teams: lead.teams,
    stat: statFor(lead.value),
  }
  if (tiers[1]) {
    result.runnersUp = { teams: tiers[1].teams, stat: statFor(tiers[1].value) }
  }
  return result
}

// --- Single-team prize computers (Nannery style) ---

const winner: PrizeComputer = (scores, draw, players, teams) => {
  const final = scores.matches?.find(m => m.stage === 'F' && m.status === 'FINISHED')
  if (!final) return null
  const winnerId = matchWinnerId(final)
  if (!winnerId) return null
  const team = teams.find(t => t.id === winnerId)
  if (!team) return null
  const names = resolveNames(draw, players)
  return { player: names[team.id] ?? '—', team, stat: 'Tournament Winner 🏆' }
}

const runnerUp: PrizeComputer = (scores, draw, players, teams) => {
  const final = scores.matches?.find(m => m.stage === 'F' && m.status === 'FINISHED')
  if (!final) return null
  const loserId = matchLoserId(final)
  if (!loserId) return null
  const team = teams.find(t => t.id === loserId)
  if (!team) return null
  const names = resolveNames(draw, players)
  return { player: names[team.id] ?? '—', team, stat: 'Runner-Up 🥈' }
}

const thirdPlace: PrizeComputer = (scores, draw, players, teams) => {
  const match = scores.matches?.find(m => m.stage === 'THIRD_PLACE' && m.status === 'FINISHED')
  if (!match) return null
  const winnerId = matchWinnerId(match)
  if (!winnerId) return null
  const team = teams.find(t => t.id === winnerId)
  if (!team) return null
  const names = resolveNames(draw, players)
  return { player: names[team.id] ?? '—', team, stat: 'Third-place play-off winner 🥉' }
}

const mostGoalsScored: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  const tiers = valueTiers(Object.entries(totals).map(([id, t]) => [id, t.for]), teams)
  const names = resolveNames(draw, players)
  return leaderboardResult(tiers, names, n => `${n} goals scored`)
}

const mostConceded: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  const tiers = valueTiers(Object.entries(totals).map(([id, t]) => [id, t.against]), teams)
  const names = resolveNames(draw, players)
  return leaderboardResult(tiers, names, n => `${n} goals conceded`)
}

const mostYellows: PrizeComputer = (scores, draw, players, teams) => {
  const entries = Object.entries(scores.cards ?? {}).map(([id, c]) => [id, c.yellow]) as [string, number][]
  const tiers = valueTiers(entries, teams)
  const names = resolveNames(draw, players)
  return leaderboardResult(tiers, names, n => `${n} yellow card${n === 1 ? '' : 's'}`)
}

const firstRed: PrizeComputer = (scores, draw, players, teams) => {
  const red = scores.firstRedCard
  if (!red) return null
  const team = teams.find(t => t.id === red.teamId)
  if (!team) return null
  const names = resolveNames(draw, players)
  const stat = red.player
    ? `${red.player}${red.minute != null ? ` (${red.minute}')` : ''}`
    : 'First red card of the tournament'
  return { player: names[team.id] ?? '—', team, stat }
}

const firstEliminated: PrizeComputer = (scores, draw, players, teams) => {
  const allStandings = scores.standings ?? {}
  const all = Object.values(allStandings).flat() as Standing[]
  const eliminated = all.filter(s => s.eliminated)
  if (!eliminated.length) return null
  const bottom = eliminated.reduce((a, b) => {
    const aAt = a.eliminatedAt ?? ''
    const bAt = b.eliminatedAt ?? ''
    if (aAt !== bAt) return aAt && (!bAt || aAt < bAt) ? a : b
    if (a.points !== b.points) return a.points < b.points ? a : b
    return a.goalDiff <= b.goalDiff ? a : b
  })
  const team = teams.find(t => t.id === bottom.teamId)
  if (!team) return null
  const names = resolveNames(draw, players)
  return { player: names[team.id] ?? '—', team, stat: 'Eliminated in group stage' }
}

// --- Multi-team prize computers (LMS style, sums across all a player's teams) ---

// Each LMS player holds two teams, so a prize is the sum of a per-team value
// across both. Find the leading player(s) and break the total back down into a
// per-team badge, so it's clear which team each contribution came from.
function lmsLeaderboard(
  draw: DrawResult,
  players: Player[],
  teams: Team[],
  valueForTeam: (teamId: string) => number,
  statFor: (total: number) => string
): PrizeResult | null {
  const ptm = playerTeamMap(draw)
  const playerTotals = Array.from(ptm.entries()).map(([playerId, teamIds]) => ({
    playerId,
    val: teamIds.reduce((s, id) => s + valueForTeam(id), 0),
    teamIds,
  }))
  if (!playerTotals.length) return null
  const maxVal = Math.max(...playerTotals.map(p => p.val))
  if (maxVal === 0) return null
  const tied = playerTotals.filter(p => p.val === maxVal)
  const allTeams = tied.flatMap(p => p.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[])
  const tiedPlayerNames = tied.map(p => playerName(p.playerId, players)).join(' & ')
  const teamNotes = Object.fromEntries(allTeams.map(t => [t.id, String(valueForTeam(t.id))]))
  return { player: tiedPlayerNames, teams: allTeams, teamNotes, stat: statFor(maxVal) }
}

const lmsMostGoalsScored: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  return lmsLeaderboard(draw, players, teams, id => totals[id]?.for ?? 0, n => `${n} goals scored`)
}

const lmsMostConceded: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  return lmsLeaderboard(draw, players, teams, id => totals[id]?.against ?? 0, n => `${n} goals conceded`)
}

const lmsMostOwnGoals: PrizeComputer = (scores, draw, players, teams) => {
  const teamStats = scores.teamStats ?? {}
  return lmsLeaderboard(draw, players, teams, id => teamStats[id]?.ownGoals ?? 0,
    n => `${n} own goal${n !== 1 ? 's' : ''}`)
}

const lmsMostRedCards: PrizeComputer = (scores, draw, players, teams) => {
  const cards = scores.cards ?? {}
  return lmsLeaderboard(draw, players, teams, id => cards[id]?.red ?? 0,
    n => `${n} red card${n !== 1 ? 's' : ''}`)
}

const PRIZE_COMPUTERS: Record<string, PrizeComputer> = {
  winner,
  runnerUp,
  thirdPlace,
  mostGoalsScored,
  mostConceded,
  mostYellows,
  firstRed,
  firstEliminated,
  lmsMostGoalsScored,
  lmsMostConceded,
  lmsMostOwnGoals,
  lmsMostRedCards,
}

function TeamRow({
  team,
  player,
  isOut,
  tone = 'lead',
  note,
}: {
  team: Team
  player: string
  isOut: boolean
  tone?: 'lead' | 'chase'
  /** Optional right-aligned badge, e.g. this team's own-goal count. */
  note?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={team.flag}
        alt={team.name}
        title={isOut ? `${team.name} (knocked out)` : team.name}
        className={`w-10 h-7 object-cover rounded shrink-0 transition-opacity ${
          isOut ? 'opacity-30 grayscale' : ''
        }`}
      />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold truncate ${tone === 'lead' ? 'text-yellow-400' : 'text-white/70'}`}>
          {player}
        </p>
        <p className="text-xs text-white/60 truncate">{team.name}</p>
      </div>
      {note && (
        <span className="text-xs font-semibold text-white/70 tabular-nums shrink-0">{note}</span>
      )}
    </div>
  )
}

function PrizeCard({
  def,
  result,
  teamToPlayer,
  eliminated,
}: {
  def: PrizeDefinition
  result: PrizeResult | null
  teamToPlayer: Record<string, string>
  eliminated: Set<string>
}) {
  const displayTeams = result?.teams ?? (result?.team ? [result.team] : [])
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{def.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white">{def.title}</h3>
          <p className="text-xs text-white/40">{def.description}</p>
        </div>
        {def.amount > 0 && (
          <span className="text-sm font-bold text-yellow-400 shrink-0">€{def.amount}</span>
        )}
      </div>

      {result ? (
        <div className="bg-white/5 rounded-xl p-3 flex flex-col gap-2">
          {displayTeams.map(t => (
            <TeamRow
              key={t.id}
              team={t}
              player={teamToPlayer[t.id] ?? result.player}
              isOut={eliminated.has(t.id)}
              note={result.teamNotes?.[t.id]}
            />
          ))}
          <p className="text-xs text-white/40 text-right border-t border-white/5 pt-2 mt-1">{result.stat}</p>

          {result.runnersUp && result.runnersUp.teams.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-white/5 pt-2 mt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/30">Next closest</p>
              {result.runnersUp.teams.map(t => (
                <TeamRow
                  key={t.id}
                  team={t}
                  player={teamToPlayer[t.id] ?? '—'}
                  isOut={eliminated.has(t.id)}
                  tone="chase"
                />
              ))}
              <p className="text-xs text-white/30 text-right">{result.runnersUp.stat}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white/5 rounded-xl p-3 text-white/30 text-sm text-center">
          TBD — tournament not yet started
        </div>
      )}
    </div>
  )
}

export default function PrizesPage() {
  const { config, players, draw } = useSweepstakes()
  const [teams, setTeams] = useState<Team[]>([])
  const [scores, setScores] = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([loadTeams(), loadScores()]).then(([t, s]) => {
      setTeams(t)
      setScores(s)
      setLoading(false)
    })
  }, [])

  const teamToPlayer = useMemo(() => resolveNames(draw, players), [draw, players])
  const eliminated = useMemo(() => (scores ? eliminatedTeamIds(scores) : new Set<string>()), [scores])

  const results = useMemo(() => {
    if (!scores) return {}
    return Object.fromEntries(
      config.prizes.map(def => {
        const compute = PRIZE_COMPUTERS[def.key]
        const result = compute ? compute(scores, draw, players, teams) : null
        return [def.key, result]
      })
    )
  }, [config.prizes, scores, draw, players, teams])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] px-4">
        <div className="text-white/50 animate-pulse">Loading prizes…</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-2">Prizes</h1>
      <p className="text-white/40 text-sm mb-8">Live leaderboard — updates daily during the tournament</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {config.prizes.map(def => (
          <PrizeCard
            key={def.key}
            def={def}
            result={results[def.key] ?? null}
            teamToPlayer={teamToPlayer}
            eliminated={eliminated}
          />
        ))}
      </div>
    </div>
  )
}
