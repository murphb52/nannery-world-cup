import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const scoresPath = path.join(dataDir, 'scores.json')
const bookingsPath = path.join(dataDir, 'bookings.json')

const API_KEY = process.env.FOOTBALL_DATA_API_KEY
const COMPETITION_ID = 2000 // FIFA World Cup on football-data.org

// Free tier allows 10 requests/minute. Match details are fetched one at a
// time with a delay, and capped per run — finished matches are cached in
// data/bookings.json so each run only pays for matches it hasn't seen yet.
const DETAIL_DELAY_MS = 6500
const MAX_DETAIL_FETCHES = 20

if (!API_KEY) {
  console.error('FOOTBALL_DATA_API_KEY is not set')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

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

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE'])

async function main() {
  console.log('Fetching World Cup data from football-data.org…')

  const [matchesData, standingsData] = await Promise.all([
    apiFetch(`competitions/${COMPETITION_ID}/matches`),
    apiFetch(`competitions/${COMPETITION_ID}/standings`),
  ])

  const matches = matchesData.matches.map(m => ({
    id: m.id,
    stage: normaliseStage(m.stage),
    group: m.group ?? null,
    homeTeamId: m.homeTeam.tla,
    awayTeamId: m.awayTeam.tla,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    date: m.utcDate,
    venue: m.venue ?? null,
    status: m.status,
    winner: m.score.winner ?? null,
  }))

  const bookings = await updateBookings(matches)
  const { cards, groupCards, firstRedCard } = aggregateCards(matches, bookings)
  const eliminations = computeEliminations(matches)

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

// Card data (bookings) only appears on the per-match detail endpoint, so we
// fetch details for matches that have started and cache finished ones in
// data/bookings.json. Live matches are refetched every run until they finish.
async function updateBookings(matches) {
  const cache = readJson(bookingsPath, {})
  const bookings = {}
  let fetched = 0

  for (const m of matches) {
    const finished = m.status === 'FINISHED'
    const live = LIVE_STATUSES.has(m.status)
    if (!finished && !live) continue

    if (finished && cache[m.id] != null) {
      bookings[m.id] = cache[m.id]
      continue
    }
    if (fetched >= MAX_DETAIL_FETCHES) continue

    await sleep(DETAIL_DELAY_MS)
    fetched++
    try {
      const data = await apiFetch(`matches/${m.id}`)
      const detail = data.match ?? data
      const teamIdByApiId = {
        [detail.homeTeam?.id]: m.homeTeamId,
        [detail.awayTeam?.id]: m.awayTeamId,
      }
      bookings[m.id] = (detail.bookings ?? []).map(b => ({
        minute: b.minute ?? null,
        teamId: teamIdByApiId[b.team?.id] ?? b.team?.tla ?? null,
        player: b.player?.name ?? null,
        card: b.card, // YELLOW | YELLOW_RED | RED
      }))
    } catch (err) {
      console.warn(`Could not fetch details for match ${m.id}: ${err.message}`)
    }
  }

  // Persist only finished matches so live bookings keep refreshing.
  const finishedIds = new Set(matches.filter(m => m.status === 'FINISHED').map(m => m.id))
  const newCache = {}
  for (const [id, list] of Object.entries(bookings)) {
    if (finishedIds.has(Number(id))) newCache[id] = list
  }
  fs.writeFileSync(bookingsPath, JSON.stringify(newCache, null, 2))
  if (fetched) console.log(`Fetched booking details for ${fetched} matches`)

  return bookings
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
