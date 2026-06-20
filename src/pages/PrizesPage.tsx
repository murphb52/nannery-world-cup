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

const mostGoalsScored: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  const entries = Object.entries(totals)
  if (!entries.length) return null
  const maxFor = Math.max(...entries.map(([, t]) => t.for))
  if (maxFor === 0) return null
  const tiedTeams = entries
    .filter(([, t]) => t.for === maxFor)
    .map(([id]) => teams.find(t => t.id === id))
    .filter(Boolean) as Team[]
  if (!tiedTeams.length) return null
  const names = resolveNames(draw, players)
  const uniquePlayers = [...new Set(tiedTeams.map(t => names[t.id] ?? '—'))]
  return { player: uniquePlayers.join(' & '), teams: tiedTeams, stat: `${maxFor} goals scored` }
}

const mostConceded: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  const entries = Object.entries(totals)
  if (!entries.length) return null
  const maxAgainst = Math.max(...entries.map(([, t]) => t.against))
  if (maxAgainst === 0) return null
  const tiedTeams = entries
    .filter(([, t]) => t.against === maxAgainst)
    .map(([id]) => teams.find(t => t.id === id))
    .filter(Boolean) as Team[]
  if (!tiedTeams.length) return null
  const names = resolveNames(draw, players)
  const uniquePlayers = [...new Set(tiedTeams.map(t => names[t.id] ?? '—'))]
  return { player: uniquePlayers.join(' & '), teams: tiedTeams, stat: `${maxAgainst} goals conceded` }
}

const mostYellows: PrizeComputer = (scores, draw, players, teams) => {
  const entries = Object.entries(scores.cards ?? {})
  if (!entries.length) return null
  const maxYellow = Math.max(...entries.map(([, c]) => c.yellow))
  if (maxYellow === 0) return null
  const tiedTeams = entries
    .filter(([, c]) => c.yellow === maxYellow)
    .map(([id]) => teams.find(t => t.id === id))
    .filter(Boolean) as Team[]
  if (!tiedTeams.length) return null
  const names = resolveNames(draw, players)
  const uniquePlayers = [...new Set(tiedTeams.map(t => names[t.id] ?? '—'))]
  return { player: uniquePlayers.join(' & '), teams: tiedTeams, stat: `${maxYellow} yellow cards` }
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

const lmsMostGoalsScored: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  const ptm = playerTeamMap(draw)
  const playerTotals = Array.from(ptm.entries()).map(([playerId, teamIds]) => ({
    playerId,
    val: teamIds.reduce((s, id) => s + (totals[id]?.for ?? 0), 0),
    teamIds,
  }))
  if (!playerTotals.length) return null
  const maxVal = Math.max(...playerTotals.map(p => p.val))
  if (maxVal === 0) return null
  const tied = playerTotals.filter(p => p.val === maxVal)
  const allTeams = tied.flatMap(p => p.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[])
  const tiedPlayerNames = tied.map(p => playerName(p.playerId, players)).join(' & ')
  return { player: tiedPlayerNames, teams: allTeams, stat: `${maxVal} goals scored` }
}

const lmsMostConceded: PrizeComputer = (scores, draw, players, teams) => {
  const totals = goalTotals(scores)
  const ptm = playerTeamMap(draw)
  const playerTotals = Array.from(ptm.entries()).map(([playerId, teamIds]) => ({
    playerId,
    val: teamIds.reduce((s, id) => s + (totals[id]?.against ?? 0), 0),
    teamIds,
  }))
  if (!playerTotals.length) return null
  const maxVal = Math.max(...playerTotals.map(p => p.val))
  if (maxVal === 0) return null
  const tied = playerTotals.filter(p => p.val === maxVal)
  const allTeams = tied.flatMap(p => p.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[])
  const tiedPlayerNames = tied.map(p => playerName(p.playerId, players)).join(' & ')
  return { player: tiedPlayerNames, teams: allTeams, stat: `${maxVal} goals conceded` }
}

const lmsMostOwnGoals: PrizeComputer = (scores, draw, players, teams) => {
  const teamStats = scores.teamStats
  if (!teamStats) return null
  const ptm = playerTeamMap(draw)
  let best: { playerId: string; val: number; teamIds: string[] } | null = null
  for (const [playerId, teamIds] of ptm) {
    const val = teamIds.reduce((s, id) => s + (teamStats[id]?.ownGoals ?? 0), 0)
    if (!best || val > best.val) best = { playerId, val, teamIds }
  }
  if (!best || best.val === 0) return null
  const playerTeams = best.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[]
  return { player: playerName(best.playerId, players), teams: playerTeams, stat: `${best.val} own goal${best.val !== 1 ? 's' : ''}` }
}

const lmsMostRedCards: PrizeComputer = (scores, draw, players, teams) => {
  const cards = scores.cards ?? {}
  const ptm = playerTeamMap(draw)
  let best: { playerId: string; val: number; teamIds: string[] } | null = null
  for (const [playerId, teamIds] of ptm) {
    const val = teamIds.reduce((s, id) => s + (cards[id]?.red ?? 0), 0)
    if (!best || val > best.val) best = { playerId, val, teamIds }
  }
  if (!best || best.val === 0) return null
  const playerTeams = best.teamIds.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[]
  return { player: playerName(best.playerId, players), teams: playerTeams, stat: `${best.val} red card${best.val !== 1 ? 's' : ''}` }
}

const PRIZE_COMPUTERS: Record<string, PrizeComputer> = {
  winner,
  runnerUp,
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

function PrizeCard({ def, result }: { def: PrizeDefinition; result: PrizeResult | null }) {
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
        <div className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
          <div className="flex gap-1 shrink-0">
            {displayTeams.map(t => (
              <img key={t.id} src={t.flag} alt={t.name} className="w-10 h-7 object-cover rounded" />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-yellow-400 truncate">{result.player}</p>
            <p className="text-xs text-white/60 truncate">{displayTeams.map(t => t.name).join(' & ')}</p>
          </div>
          <p className="text-xs text-white/40 text-right shrink-0">{result.stat}</p>
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
          <PrizeCard key={def.key} def={def} result={results[def.key] ?? null} />
        ))}
      </div>
    </div>
  )
}
