import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '..', 'data')

const API_KEY = process.env.FOOTBALL_DATA_API_KEY
const COMPETITION_ID = 2000 // FIFA World Cup on football-data.org

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
  }))

  const standings = {}
  for (const group of (standingsData.standings ?? [])) {
    const groupLetter = group.group?.replace('GROUP_', '') ?? group.stage
    standings[groupLetter] = group.table.map(row => ({
      teamId: row.team.tla,
      played: row.playedGames,
      won: row.won,
      drawn: row.draw,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDiff: row.goalDifference,
      points: row.points,
      yellowCards: 0,
      redCards: 0,
      eliminated: false,
    }))
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    matches,
    standings,
  }

  fs.writeFileSync(path.join(dataDir, 'scores.json'), JSON.stringify(output, null, 2))
  console.log(`Saved ${matches.length} matches, ${Object.keys(standings).length} groups`)
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
