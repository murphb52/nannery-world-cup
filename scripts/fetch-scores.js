import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchEventsFromEspn } from './fetch-cards.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const scoresPath = path.join(dataDir, 'scores.json')
const bookingsPath = path.join(dataDir, 'bookings.json')
const ownGoalsPath = path.join(dataDir, 'owngoals.json')

const API_KEY = process.env.FOOTBALL_DATA_API_KEY
const COMPETITION_ID = 2000 // FIFA World Cup on football-data.org

// Teams mathematically eliminated before their group finishes (0 pts, 2 losses in 3).
// The auto-detection only fires when a whole group completes, so we hardcode these.
const MANUAL_ELIMINATIONS = {
  HAI: '2026-06-20T00:30:00Z', // Haiti out after two losses (0–1 vs SCO, 0–3 vs BRA)
}

if (!API_KEY) {
  console.error('FOOTBALL_DATA_API_KEY is not set')
  process.exit(1)
}

async function apiFetch(endpoint) {
  const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
    headers: { 'X-Auth-Token': API_KEY },
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${endpoint}`)
  return res.json()
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

// Goals scored in normal time + extra time, excluding any penalty-shootout
// tally. football-data.org folds the shootout result into `fullTime` for
// matches decided on penalties, so for those we reconstruct the on-pitch score
// from regularTime + extraTime, falling back to fullTime - penalties, then to
// the level score a shootout necessarily implies.
function runOfPlayScore(score) {
  const ft = score?.fullTime ?? {}
  if (score?.duration !== 'PENALTY_SHOOTOUT') {
    return { home: ft.home ?? null, away: ft.away ?? null }
  }
  const reg = score.regularTime
  const ext = score.extraTime
  if (reg && reg.home != null) {
    return {
      home: (reg.home ?? 0) + (ext?.home ?? 0),
      away: (reg.away ?? 0) + (ext?.away ?? 0),
    }
  }
  const pen = score.penalties
  if (pen && pen.home != null && ft.home != null && ft.away != null) {
    return { home: ft.home - pen.home, away: ft.away - pen.away }
  }
  // A shootout only occurs when the sides are level after extra time.
  const level = Math.min(ft.home ?? 0, ft.away ?? 0)
  return { home: level, away: level }
}

// The shootout score, when a match was decided on penalties; otherwise null.
function penaltyScore(score) {
  const pen = score?.penalties
  if (score?.duration !== 'PENALTY_SHOOTOUT' || !pen || pen.home == null) return null
  return { home: pen.home, away: pen.away }
}

async function main() {
  console.log('Fetching World Cup data from football-data.org…')

  const [matchesData, standingsData] = await Promise.all([
    apiFetch(`competitions/${COMPETITION_ID}/matches`),
    apiFetch(`competitions/${COMPETITION_ID}/standings`),
  ])

  const rawMatches = matchesData.matches
  const matches = rawMatches.map(m => {
    const { home, away } = runOfPlayScore(m.score)
    return {
      id: m.id,
      stage: normaliseStage(m.stage),
      group: m.group ?? null,
      homeTeamId: m.homeTeam.tla,
      awayTeamId: m.awayTeam.tla,
      homeScore: home,
      awayScore: away,
      date: m.utcDate,
      venue: m.venue ?? null,
      status: m.status,
      winner: m.score.winner ?? null,
      penalties: penaltyScore(m.score),
    }
  })
  const teamStats = computeTeamStats(rawMatches)

  const existingBookings = readJson(bookingsPath, {})
  const existingOwnGoals = readJson(ownGoalsPath, {})
  let bookings = existingBookings
  let ownGoalsByMatch = existingOwnGoals
  try {
    const events = await fetchEventsFromEspn(matches, existingBookings, existingOwnGoals)
    bookings = events.bookings
    ownGoalsByMatch = events.ownGoals
    if (JSON.stringify(bookings) !== JSON.stringify(existingBookings)) {
      fs.writeFileSync(bookingsPath, JSON.stringify(bookings, null, 2))
    }
    if (JSON.stringify(ownGoalsByMatch) !== JSON.stringify(existingOwnGoals)) {
      fs.writeFileSync(ownGoalsPath, JSON.stringify(ownGoalsByMatch, null, 2))
    }
  } catch (err) {
    console.warn(`ESPN event fetch failed, using existing cache: ${err.message}`)
    bookings = existingBookings
    ownGoalsByMatch = existingOwnGoals
  }
  // football-data's matches-list endpoint omits per-goal detail, so own goals
  // come from ESPN's key events instead. Fold them into the per-team stats.
  applyOwnGoals(teamStats, ownGoalsByMatch)
  const { cards, groupCards, firstRedCard } = aggregateCards(matches, bookings)
  const eliminations = { ...computeEliminations(matches), ...MANUAL_ELIMINATIONS }

  const standings = {}
  for (const group of (standingsData.standings ?? [])) {
    const groupLetter = group.group?.replace('GROUP_', '') ?? group.stage
    standings[groupLetter] = group.table.map(row => {
      const teamId = row.team.tla
      const elim = eliminations[teamId]
      return {
        teamId,
        played: row.playedGames,
        won: row.won,
        drawn: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff: row.goalDifference,
        points: row.points,
        yellowCards: groupCards[teamId]?.yellow ?? 0,
        redCards: groupCards[teamId]?.red ?? 0,
        eliminated: Boolean(elim),
        eliminatedAt: elim ?? null,
      }
    })
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    matches,
    standings,
    cards,
    firstRedCard,
    teamStats,
  }

  // Only rewrite scores.json when something other than the timestamp changed,
  // so the Actions workflow doesn't commit (and redeploy) a no-op every run.
  const previous = readJson(scoresPath, null)
  if (previous && sameIgnoringTimestamp(previous, output)) {
    console.log('No changes since last fetch — leaving scores.json untouched')
    return
  }

  fs.writeFileSync(scoresPath, JSON.stringify(output, null, 2))
  console.log(`Saved ${matches.length} matches, ${Object.keys(standings).length} groups`)
}

function sameIgnoringTimestamp(a, b) {
  const strip = ({ lastUpdated, ...rest }) => rest
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b))
}

function aggregateCards(matches, bookings) {
  const matchById = new Map(matches.map(m => [m.id, m]))
  const cards = {} // tournament-wide, all stages
  const groupCards = {} // group stage only, mirrors what standings cover
  let firstRedCard = null

  for (const [matchId, list] of Object.entries(bookings)) {
    const match = matchById.get(Number(matchId))
    for (const b of list) {
      if (!b.teamId) continue
      const t = (cards[b.teamId] ??= { yellow: 0, red: 0 })
      const g = match?.stage === 'GROUP' ? (groupCards[b.teamId] ??= { yellow: 0, red: 0 }) : null
      if (b.card === 'YELLOW' || b.card === 'YELLOW_RED') {
        t.yellow++
        if (g) g.yellow++
      }
      if (b.card === 'RED' || b.card === 'YELLOW_RED') {
        t.red++
        if (g) g.red++
        const candidate = {
          teamId: b.teamId,
          matchId: Number(matchId),
          date: match?.date ?? null,
          minute: b.minute,
          player: b.player,
        }
        if (!firstRedCard || isEarlierCard(candidate, firstRedCard)) {
          firstRedCard = candidate
        }
      }
    }
  }

  return { cards, groupCards, firstRedCard }
}

function isEarlierCard(a, b) {
  if (a.date !== b.date) return (a.date ?? '') < (b.date ?? '')
  return (a.minute ?? 999) < (b.minute ?? 999)
}

// 2026 format: 12 groups of 4; top two per group advance, plus the 8 best
// third-placed teams. A 4th-placed team is out as soon as its group finishes;
// the 4 worst third-placed teams are out once every group has finished.
// Returns teamId -> ISO date of the match that confirmed elimination.
function computeEliminations(matches) {
  const groups = {}
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !m.group) continue
    ;(groups[m.group] ??= []).push(m)
  }

  const eliminations = {}
  const thirdPlaced = []
  let allGroupsDone = Object.keys(groups).length > 0
  let lastGroupMatchDate = ''

  for (const groupMatches of Object.values(groups)) {
    const done = groupMatches.every(m => m.status === 'FINISHED')
    if (!done) {
      allGroupsDone = false
      continue
    }
    const table = miniTable(groupMatches)
    const completedAt = groupMatches.reduce((d, m) => m.date > d ? m.date : d, '')
    if (completedAt > lastGroupMatchDate) lastGroupMatchDate = completedAt
    if (table[3]) eliminations[table[3].teamId] = completedAt
    if (table[2]) thirdPlaced.push(table[2])
  }

  if (allGroupsDone && thirdPlaced.length === 12) {
    thirdPlaced.sort((a, b) =>
      b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
    for (const row of thirdPlaced.slice(8)) {
      eliminations[row.teamId] = lastGroupMatchDate
    }
  }

  return eliminations
}

// Minimal group table from finished matches, enough to find 3rd/4th place.
function miniTable(groupMatches) {
  const rows = {}
  for (const m of groupMatches) {
    if (m.homeScore == null || m.awayScore == null) continue
    const home = (rows[m.homeTeamId] ??= { teamId: m.homeTeamId, points: 0, goalDiff: 0, goalsFor: 0 })
    const away = (rows[m.awayTeamId] ??= { teamId: m.awayTeamId, points: 0, goalDiff: 0, goalsFor: 0 })
    home.goalsFor += m.homeScore
    away.goalsFor += m.awayScore
    home.goalDiff += m.homeScore - m.awayScore
    away.goalDiff += m.awayScore - m.homeScore
    if (m.homeScore > m.awayScore) home.points += 3
    else if (m.homeScore < m.awayScore) away.points += 3
    else { home.points += 1; away.points += 1 }
  }
  return Object.values(rows).sort((a, b) =>
    b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
}

// Aggregate per-team goals scored and conceded from raw API match data. Own
// goals are filled in separately from ESPN key events (applyOwnGoals), because
// football-data.org's matches-list endpoint does not include per-goal detail.
function computeTeamStats(rawMatches) {
  const stats = {}
  for (const m of rawMatches) {
    if (m.status !== 'FINISHED') continue
    const home = m.homeTeam?.tla
    const away = m.awayTeam?.tla
    if (!home || !away) continue
    ;(stats[home] ??= { scored: 0, conceded: 0, ownGoals: 0 })
    ;(stats[away] ??= { scored: 0, conceded: 0, ownGoals: 0 })

    const { home: rop, away: ropAway } = runOfPlayScore(m.score)
    const hs = rop ?? 0
    const as_ = ropAway ?? 0
    stats[home].scored += hs
    stats[home].conceded += as_
    stats[away].scored += as_
    stats[away].conceded += hs
  }
  return stats
}

// Fold ESPN-sourced own goals into teamStats. ownGoalsByMatch maps a match id
// to a list of { teamId } entries where teamId is the COMMITTING team.
function applyOwnGoals(stats, ownGoalsByMatch) {
  for (const events of Object.values(ownGoalsByMatch ?? {})) {
    for (const og of events ?? []) {
      if (!og.teamId) continue
      ;(stats[og.teamId] ??= { scored: 0, conceded: 0, ownGoals: 0 }).ownGoals++
    }
  }
  return stats
}

function normaliseStage(stage) {
  const map = {
    GROUP_STAGE: 'GROUP',
    LAST_32: 'R32',
    LAST_16: 'R16',
    QUARTER_FINALS: 'QF',
    SEMI_FINALS: 'SF',
    FINAL: 'F',
  }
  return map[stage] ?? stage
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
