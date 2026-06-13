import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')
const scoresPath = path.join(dataDir, 'scores.json')
const bookingsPath = path.join(dataDir, 'bookings.json')
const fixtureMapPath = path.join(dataDir, 'fixture-map.json')

const API_KEY = process.env.FOOTBALL_DATA_API_KEY
const COMPETITION_ID = 2000 // FIFA World Cup on football-data.org

// API-Football (api-football.com) — used for match events (cards).
// Free tier: 100 requests/day. We only fetch events once per finished match
// and cache them, so the total over the tournament is ≤104 event calls + a
// handful of fixture-list refreshes. Well within the daily limit.
const AF_KEY = process.env.API_FOOTBALL_KEY
const AF_BASE = 'https://v3.football.api-sports.io'
const AF_LEAGUE = 1    // FIFA World Cup
const AF_SEASON = 2026
const AF_EVENT_DELAY_MS = 1200  // ~50 req/min, well under the free-tier limit
const MAX_EVENT_FETCHES = 10    // cap per run to spread load across runs

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

async function afFetch(endpoint) {
  const res = await fetch(`${AF_BASE}/${endpoint}`, {
    headers: { 'x-apisports-key': AF_KEY },
  })
  if (!res.ok) throw new Error(`API-Football ${res.status}: ${endpoint}`)
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

// Fetch card events from API-Football for finished/live matches.
// Finished matches are cached in data/bookings.json (only written when the
// API returns at least one card, so matches with no cards are retried each
// run until real data arrives).
async function updateBookings(matches) {
  if (!AF_KEY) {
    console.warn('API_FOOTBALL_KEY not set — skipping card fetch')
    return readJson(bookingsPath, {})
  }

  const cache = readJson(bookingsPath, {})
  const fixtureMap = await loadFixtureMap(matches)
  const bookings = {}
  let fetched = 0

  for (const m of matches) {
    const finished = m.status === 'FINISHED'
    const live = LIVE_STATUSES.has(m.status)
    if (!finished && !live) continue

    if (finished && cache[m.id]) {
      bookings[m.id] = cache[m.id]
      continue
    }
    if (fetched >= MAX_EVENT_FETCHES) continue

    const entry = fixtureMap[m.id]
    if (!entry) continue

    await sleep(AF_EVENT_DELAY_MS)
    fetched++
    try {
      const data = await afFetch(`fixtures/events?fixture=${entry.fixtureId}`)
      bookings[m.id] = (data.response ?? [])
        .filter(e => e.type === 'Card')
        .map(e => ({
          minute: e.time?.elapsed ?? null,
          teamId: e.team?.id === entry.homeApiId ? m.homeTeamId
            : e.team?.id === entry.awayApiId ? m.awayTeamId
            : null,
          player: e.player?.name ?? null,
          card: normaliseCard(e.detail),
        }))
    } catch (err) {
      console.warn(`Could not fetch events for match ${m.id}: ${err.message}`)
    }
  }

  // Persist only finished matches with actual bookings so that matches where
  // the API hasn't yet populated card data get retried on the next run.
  const finishedIds = new Set(matches.filter(m => m.status === 'FINISHED').map(m => m.id))
  const newCache = {}
  for (const [id, list] of Object.entries(bookings)) {
    if (finishedIds.has(Number(id)) && list.length > 0) newCache[id] = list
  }
  fs.writeFileSync(bookingsPath, JSON.stringify(newCache, null, 2))
  if (fetched) console.log(`Fetched card events for ${fetched} matches`)

  return bookings
}

// Build/update a mapping from football-data.org match IDs to API-Football
// fixture IDs. Stored in data/fixture-map.json so we only pay for the
// bulk fixture-list call when new finished matches appear that aren't mapped yet.
async function loadFixtureMap(matches) {
  const map = readJson(fixtureMapPath, {})

  const unmapped = matches.filter(m => m.status === 'FINISHED' && !map[m.id])
  if (!unmapped.length) return map

  try {
    console.log(`Fetching API-Football fixture list to map ${unmapped.length} match(es)…`)
    const data = await afFetch(`fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`)

    // Index by date + home TLA + away TLA so we can cross-reference with
    // football-data.org matches (both use FIFA 3-letter team codes).
    const byKey = {}
    for (const f of data.response ?? []) {
      const date = f.fixture?.date?.split('T')[0]
      if (!date) continue
      const key = `${date}|${f.teams.home.code}|${f.teams.away.code}`
      byKey[key] = {
        fixtureId: f.fixture.id,
        homeApiId: f.teams.home.id,
        awayApiId: f.teams.away.id,
      }
    }

    let updated = false
    for (const m of unmapped) {
      const date = m.date.split('T')[0]
      const key = `${date}|${m.homeTeamId}|${m.awayTeamId}`
      if (byKey[key]) {
        map[m.id] = byKey[key]
        updated = true
      } else {
        console.warn(`No API-Football fixture found for ${m.homeTeamId} vs ${m.awayTeamId} on ${date}`)
      }
    }

    if (updated) fs.writeFileSync(fixtureMapPath, JSON.stringify(map, null, 2))
  } catch (err) {
    console.warn(`Could not fetch API-Football fixture list: ${err.message}`)
  }

  return map
}

function normaliseCard(detail) {
  if (detail === 'Yellow Card') return 'YELLOW'
  if (detail === 'Red Card') return 'RED'
  if (detail === 'Yellow Red Card') return 'YELLOW_RED'
  return detail ?? 'YELLOW'
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
